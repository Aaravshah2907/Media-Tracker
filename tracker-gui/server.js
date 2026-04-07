import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;
const bus = new EventEmitter();

// Config path
const MT_CONFIG_DIR = path.join(process.env.HOME, '.config/mt');
const ENV_PATH = path.join(MT_CONFIG_DIR, '.env');

// Helper to load/parse .env
const getEnvConfig = () => {
    if (!fs.existsSync(ENV_PATH)) return {};
    const content = fs.readFileSync(ENV_PATH, 'utf8');
    const config = {};
    content.split('\n').forEach(line => {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?$/);
        if (match) {
            let value = match[2] || '';
            // Remove surrounding quotes if any
            value = value.replace(/^(['"])(.*)\1$/, '$2');
            config[match[1]] = value;
        }
    });
    return config;
};

// Initial load
let TMDB_TOKEN = getEnvConfig().TMDB_TOKEN || '';

// Paths - Prefer DATA_DIR environment variable
const DATA_DIR = process.env.DATA_DIR || path.join(process.env.HOME, 'Documents/Personal/Tracker');
const LIBRARY_FILE = path.join(DATA_DIR, 'library.json');
const CACHE_DIR = path.join(DATA_DIR, 'cache');
const MEDIA_DIR = path.join(DATA_DIR, 'media');
const PENDING_FILE = path.join(CACHE_DIR, 'pending.json');

// Ensure directories exist
fs.ensureDirSync(MEDIA_DIR);
fs.ensureDirSync(CACHE_DIR);

// Helper to get filename for an ID
const getMediaFilename = (id) => id.replace(/[:\/]/g, '_') + '.json';

// Prefer the workspace-local .local/bin if it exists
const LOCAL_BIN = path.join(DATA_DIR, '.local/bin');
const HOME_BIN = path.join(process.env.HOME, '.local/bin');
const BIN_DIR = fs.existsSync(LOCAL_BIN) ? LOCAL_BIN : HOME_BIN;

app.use(cors());
app.use(bodyParser.json());

// Serve static files from the React frontend build
const DIST_PATH = path.join(__dirname, 'dist');
if (fs.existsSync(DIST_PATH)) {
    app.use(express.static(DIST_PATH));
}

let activeProcess = null;

// Helper to escape shell arguments
const escapeShell = (arg) => {
    if (typeof arg !== 'string') return arg;
    if (arg === '') return "''";
    // If it only contains "safe" characters (no spaces, etc), don't quote it
    if (/^[a-zA-Z0-9_\-\.]+$/.test(arg)) {
        return arg;
    }
    return `'${arg.replace(/'/g, "'\\''")}'`;
};

// Helper: Enrich media item from its provider cache
const enrichFromCache = (item, cache) => {
    if (!cache) return item;
    
    // Core details based on type
    const details = {};
    let brand = null;
    
    if (item.type === 'movie') {
        details.runtime = cache.runtime;
        details.tagline = cache.tagline;
        details.budget = cache.budget;
        details.revenue = cache.revenue;
        details.collection = cache.belongs_to_collection?.name;
        details.status = cache.status;
        brand = cache.production_companies?.[0]?.name;

        // Auto-convert movies with 0/1 progress to runtime-based tracking
        if (item.progress.unit === 'movie' || !item.progress.total || item.progress.total <= 1) {
            item.progress.total = cache.runtime || item.progress.total;
            item.progress.unit = 'min';
        }
    } else if (item.type === 'tv') {
        brand = cache.network?.name || cache.webChannel?.name;
        details.network = brand;
        details.premiered = cache.premiered;
        details.ended = cache.ended;
        details.status = cache.status;
        details.average_runtime = cache.averageRuntime;
        details.official_site = cache.officialSite;
    } else if (item.type === 'book') {
        const info = cache.volumeInfo || {};
        brand = info.publisher;
        details.authors = info.authors || [];
        details.publisher = brand;
        details.published_date = info.publishedDate;
        details.page_count = info.pageCount;
        details.isbn = info.industryIdentifiers || [];
        details.series = item.metadata?.series || "";
    } else if (item.type === 'anime' || item.type === 'manga') {
        // Anilist/Jikan structure
        const data = cache.data?.Media || cache.data || cache;
        const studios = data.studios?.nodes?.map(s => s.name) || (data.producers?.map(p => p.name)) || [];
        brand = studios[0];
        details.studios = studios;
        details.source = data.source;
        details.status = data.status;
        details.serialization = data.serialization || (data.serializations?.map(s => s.name)) || "";
    }
    
    item.brand = brand;
    item.details = details;
    return item;
};

// Search Proxy API
app.post('/api/media/:id/batch-episodes', async (req, res) => {
    try {
        const { id } = req.params;
        const { episodes } = req.body; // format: [{ number, season, watched }]
        const filename = getMediaFilename(id);
        const filePath = path.join(MEDIA_DIR, filename);
        
        if (await fs.pathExists(filePath)) {
            const item = await fs.readJson(filePath);
            if (!item.userEpisodes) item.userEpisodes = {};
            
            episodes.forEach(ep => {
                const epKey = `${ep.season || 0}_${ep.number}`;
                item.userEpisodes[epKey] = {
                    ...(item.userEpisodes[epKey] || {}),
                    ...ep
                };
            });
            
            // Check for progress update
            const anyWatched = episodes.some(ep => ep.watched);
            if (anyWatched) {
                // Find highest absolute progress
                try {
                    const cacheFilename = id.replace(/[:\/]/g, '_') + '.json';
                    const subfolders = ['tv', 'anime'];
                    let allEps = [];
                    
                    for (const sub of subfolders) {
                        const cachePath = path.join(CACHE_DIR, sub, cacheFilename);
                        if (fs.existsSync(cachePath)) {
                            const cache = await fs.readJson(cachePath);
                            if (sub === 'tv') allEps = cache._embedded?.episodes || [];
                            else if (sub === 'anime') {
                                const epFile = path.join(CACHE_DIR, 'anime', cacheFilename.replace('.json', '_episodes.json'));
                                if (fs.existsSync(epFile)) {
                                    const epData = await fs.readJson(epFile);
                                    allEps = epData.data || [];
                                }
                            }
                            break;
                        }
                    }

                    if (allEps.length > 0) {
                        // Find the absolute index of the highest watched episode in the sidecar
                        let maxProgress = 0;
                        Object.keys(item.userEpisodes).forEach(key => {
                            const ep = item.userEpisodes[key];
                            if (ep.watched) {
                                const idx = allEps.findIndex(e => (e.number === ep.number || e.mal_id === ep.number) && (e.season === ep.season || !e.season));
                                if (idx !== -1 && (idx + 1) > maxProgress) {
                                    maxProgress = idx + 1;
                                }
                            }
                        });

                        if (maxProgress > item.progress.current) {
                            item.progress.current = maxProgress;
                            // Also update Library index
                            const libData = await fs.readJson(LIBRARY_FILE);
                            const libIdx = libData.media.findIndex(m => m.id === id);
                            if (libIdx !== -1) {
                                libData.media[libIdx].progress.current = maxProgress;
                                await fs.writeJson(LIBRARY_FILE, libData, { spaces: 2 });
                            }
                        }
                    }
                } catch (e) { console.error("Auto-progress failed:", e); }
            }
            
            await fs.writeJson(filePath, item, { spaces: 2 });
            res.json({ success: true, userEpisodes: item.userEpisodes, progress: item.progress });
        } else {
            res.status(404).json({ error: 'Sidecar not found' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/search/:type/:query', async (req, res) => {
    const { type, query } = req.params;
    const q = encodeURIComponent(query);
    
    try {
        const config = getEnvConfig();
        const limit = parseInt(config.SEARCH_LIMIT) || 12;
        const region = config.TMDB_REGION || 'US';
        
        let results = [];
        if (type === 'movie') {
            const tmdbRes = await axios.get(`https://api.themoviedb.org/3/search/movie?query=${q}&region=${region}`, {
                headers: { Authorization: `Bearer ${TMDB_TOKEN}` }
            });
            results = tmdbRes.data.results.slice(0, limit).map(r => ({
                id: r.id,
                title: r.title,
                type: 'movie',
                year: r.release_date?.split('-')[0],
                poster_path: r.poster_path ? `https://image.tmdb.org/t/p/w780${r.poster_path}` : null,
                overview: r.overview,
                vote_average: r.vote_average,
                episodes: 1,
                source: { provider: 'tmdb', id: r.id.toString() }
            }));
        } else if (type === 'tv') {
            const tvRes = await axios.get(`https://api.tvmaze.com/search/shows?q=${q}`);
            results = tvRes.data.slice(0, limit).map(r => ({
                id: r.show.id,
                title: r.show.name,
                type: 'tv',
                year: r.show.premiered?.split('-')[0],
                poster_path: r.show.image?.original || r.show.image?.medium,
                overview: r.show.summary?.replace(/<[^>]*>?/gm, ''),
                vote_average: r.show.rating?.average,
                episodes: 0, // TVMaze doesn't include total in search; mt-info will fetch this
                source: { provider: 'tvmaze', id: r.show.id.toString() }
            }));
        } else if (type === 'anime') {
            const aniRes = await axios.get(`https://api.jikan.moe/v4/anime?q=${q}`);
            results = aniRes.data.data.slice(0, limit).map(r => ({
                id: r.mal_id,
                title: r.title_english || r.title,
                type: 'anime',
                year: r.aired?.from?.split('-')[0],
                poster_path: r.images?.jpg?.large_image_url,
                overview: r.synopsis,
                vote_average: r.score,
                episodes: r.episodes || 0,
                source: { provider: 'mal', id: r.mal_id.toString() }
            }));
        } else if (type === 'manga') {
            const aniRes = await axios.get(`https://api.jikan.moe/v4/manga?q=${q}`);
            results = aniRes.data.data.slice(0, limit).map(r => ({
                id: r.mal_id,
                title: r.title_english || r.title,
                type: 'manga',
                year: r.published?.from?.split('-')[0],
                poster_path: r.images?.jpg?.large_image_url,
                overview: r.synopsis,
                vote_average: r.score,
                episodes: r.chapters || r.volumes || 0,
                source: { provider: 'mal', id: r.mal_id.toString() }
            }));
        } else if (type === 'book') {
            const gbRes = await axios.get(`https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=${limit}`);
            results = (gbRes.data.items || []).map(item => {
                const info = item.volumeInfo;
                return {
                    id: item.id,
                    title: info.title,
                    type: 'book',
                    year: info.publishedDate?.split('-')[0],
                    poster_path: info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || null,
                    overview: info.description || '', // This is the blurb
                    vote_average: (info.averageRating || 0) * 2,
                    episodes: info.pageCount || 0,
                    source: { provider: 'googlebooks', id: item.id }
                };
            });
        }
        res.json(results);
    } catch (err) {
        console.error('Search failed:', err.message);
        res.status(500).json({ error: 'Search failed' });
    }
});

app.post('/api/add-to-library', async (req, res) => {
    try {
        const item = req.body;
        const data = await fs.readJson(LIBRARY_FILE);
        
        let totalEpisodes = parseInt(item.episodes) || 0;
        let totalSeasonsCount = 1;
        
        // Deep Hydration: If counts are missing, fetch them before writing
        if (item.type === 'tv' && item.source.id) {
            try {
                const fullRes = await axios.get(`https://api.tvmaze.com/shows/${item.source.id}?embed=episodes`);
                const episodes = fullRes.data._embedded?.episodes || [];
                totalEpisodes = episodes.length;
                totalSeasonsCount = [...new Set(episodes.map(e => e.season))].length;
            } catch (e) { /* fallback to user data */ }
        } else if (item.type === 'anime' && !totalEpisodes) {
            try {
                const aniRes = await axios.get(`https://api.jikan.moe/v4/anime/${item.source.id}`);
                totalEpisodes = aniRes.data.data?.episodes || 0;
            } catch (e) { /* fallback */ }
        }

        const now = new Date().toISOString();
        const newItem = {
            id: `${item.source.provider}:${item.source.id}`,
            title: item.title,
            type: item.type,
            subtype: item.type === 'tv' ? 'series' : null,
            status: "planned",
            progress: { 
                current: 0, 
                total: totalEpisodes || (item.type === 'movie' ? 1 : null), 
                unit: item.type === 'movie' ? "movie" : (item.type === 'book' ? "page" : "episode") 
            },
            seasons: (item.type === 'tv' || item.type === 'anime') ? { current: 1, total: totalSeasonsCount } : { current: 0, total: null },
            metadata: { 
                year: parseInt(item.year) || null,
                release_date: item.release_date || (item.year ? item.year.toString() : null),
                genres: item.genres || [],
                author: item.author ? [item.author] : [],
                series: item.series || "",
                isbn: item.isbn || []
            },
            source: { provider: item.source.provider, id: item.source.id },
            local: { path: "", available: false },
            timestamps: { added: now, updated: now },
            poster_path: item.poster_path, 
            vote_average: item.vote_average,
            overview: item.overview,
            original_title: item.title,
            original_language: "en",
            popularity: 0
        };
        
        // Try to enrich brand from cache immediately
        try {
            const cacheFilename = newItem.id.replace(/[:\/]/g, '_') + '.json';
            const subfolders = ['tv', 'anime', 'movie', 'book'];
            for (const sub of subfolders) {
                const cp = path.join(CACHE_DIR, sub, cacheFilename);
                if (await fs.pathExists(cp)) {
                    const cache = await fs.readJson(cp);
                    newItem = enrichFromCache(newItem, cache);
                    break;
                }
            }
        } catch (e) {}

        // Prevent duplicates
        if (!data.media.some(m => m.id === newItem.id)) {
            // 1. Save FULL data to media/ folder
            const filename = getMediaFilename(newItem.id);
            await fs.writeJson(path.join(MEDIA_DIR, filename), newItem, { spaces: 2 });

            // 2. Save MINIMAL data to library index
            const minimalItem = {
                id: newItem.id,
                title: newItem.title,
                type: newItem.type,
                status: newItem.status,
                progress: newItem.progress,
                poster_path: newItem.poster_path,
                local: newItem.local,
                rating: newItem.vote_average,
                brand: newItem.brand || "",
                metadata: { year: newItem.metadata?.year, release_date: newItem.metadata?.release_date },
                source: newItem.source,
                file: `media/${filename}`
            };
            data.media.push(minimalItem);
            await fs.writeJson(LIBRARY_FILE, data, { spaces: 2 });
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to add item' });
    }
});

// API Endpoints
app.get('/api/library', async (req, res) => {
    try {
        const raw = await fs.readFile(LIBRARY_FILE, 'utf8');
        const data = JSON.parse(raw);
        
        // Auto-detect availability AND Brand metadata for existing items
        let changed = false;
        const media = data.media || [];
        for (let item of media) {
            // 1. Availability check
            if (item.local?.path) {
                const exists = fs.existsSync(item.local.path);
                if (item.local.available !== exists) {
                    item.local.available = exists;
                    changed = true;
                }
            }

            // 2. Brand Enrichment (if missing)
            if (item.brand === undefined || item.brand === null) {
                const cacheFilename = item.id.replace(/[:\/]/g, '_') + '.json';
                const subfolders = ['tv', 'anime', 'movie', 'book'];
                for (const sub of subfolders) {
                    const cp = path.join(CACHE_DIR, sub, cacheFilename);
                    if (fs.existsSync(cp)) {
                        const cache = await fs.readJson(cp);
                        // Mini enrichment inline to avoid full object replacement
                        let b = null;
                        if (item.type === 'movie') b = cache.production_companies?.[0]?.name;
                        else if (item.type === 'tv') b = cache.network?.name || cache.webChannel?.name;
                        else if (item.type === 'book') b = cache.volumeInfo?.publisher;
                        else if (item.type === 'anime' || item.type === 'manga') {
                             const data = cache.data?.Media || cache.data || cache;
                             const studios = data.studios?.nodes?.map(s => s.name) || (data.producers?.map(p => p.name)) || [];
                             b = studios[0];
                        }
                        
                        if (b) {
                            item.brand = b;
                            changed = true;
                        } else {
                            item.brand = ""; // Done checking, don't repeat
                            changed = true;
                        }
                        break;
                    }
                }
            }
        }
        
        if (changed) {
            await fs.writeJson(LIBRARY_FILE, data, { spaces: 2 });
        }
        
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Failed to read library' });
    }
});

app.post('/api/library', async (req, res) => {
    try {
        const data = req.body;
        if (data.media) {
            // When saving bulk (e.g. from App.jsx handleSave or handleBulkProgress)
            // we should update BOTH the index and the individual files
            for (let i = 0; i < data.media.length; i++) {
                const item = data.media[i];
                if (item.local?.path) {
                    item.local.available = fs.existsSync(item.local.path);
                }

                // If it's a full object sent from frontend, save it to media/
                // If it's just index data, we might need to load/merge, but usually handleSave sends the full object.
                // To be safe, we check if it has the "overview" or "metadata" fields which indicate it's the full object.
                if (item.overview !== undefined || item.metadata?.genres !== undefined) {
                    const filename = getMediaFilename(item.id);
                    await fs.writeJson(path.join(MEDIA_DIR, filename), item, { spaces: 2 });
                    
                    // Replace in index with minimal version
                    data.media[i] = {
                        id: item.id,
                        title: item.title,
                        type: item.type,
                        status: item.status,
                        progress: item.progress,
                        poster_path: item.poster_path,
                        local: item.local,
                        rating: item.rating || item.vote_average,
                        brand: item.brand,
                        metadata: { year: item.metadata?.year, release_date: item.metadata?.release_date },
                        file: `media/${filename}`
                    };
                }
            }
        }
        await fs.writeFile(LIBRARY_FILE, JSON.stringify(data, null, 2), 'utf8');
        res.json({ success: true });
    } catch (err) {
        console.error('Failed to update library:', err);
        res.status(500).json({ error: 'Failed to update library' });
    }
});

// GET full media details
app.get('/api/media/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const filename = getMediaFilename(id);
        const filePath = path.join(MEDIA_DIR, filename);
        
        let item = null;
        if (await fs.pathExists(filePath)) {
            item = await fs.readJson(filePath);
        } else {
            const data = await fs.readJson(LIBRARY_FILE);
            item = data.media.find(m => m.id === id);
        }

        if (item) {
            // Re-hydrate details from cache if missing or just to be fresh
            try {
                const cacheFilename = id.replace(/[:\/]/g, '_') + '.json';
                // Try to find cache in any type subfolder or common
                const subfolders = ['movie', 'tv', 'anime', 'manga', 'book'];
                for (const sub of subfolders) {
                    const cachePath = path.join(CACHE_DIR, sub, cacheFilename);
                    if (fs.existsSync(cachePath)) {
                        const cache = await fs.readJson(cachePath);
                        item = enrichFromCache(item, cache);
                        break;
                    }
                }
            } catch (e) { /* silent enrichment failure */ }
            
            res.json(item);
        } else {
            res.status(404).json({ error: 'Media not found' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch media details' });
    }
});

app.get('/api/cache/:type/:id', async (req, res) => {
    try {
        const { type, id } = req.params;
        const safe_id = id.replace(/[:\/]/g, '_');
        const filename = safe_id + '.json';
        const filePath = path.join(CACHE_DIR, type, filename);
        
        if (await fs.pathExists(filePath)) {
            const data = await fs.readJson(filePath);
            
            // Special handling for Jikan Anime to include episodes from the sidecar file
            if (type === 'anime') {
                const epFilename = safe_id + '_episodes.json';
                const epPath = path.join(CACHE_DIR, 'anime', epFilename);
                if (await fs.pathExists(epPath)) {
                    const epData = await fs.readJson(epPath);
                    // Jikan episodes are usually in epData.data
                    data.jikanEpisodes = epData.data || [];
                }
            }
            
            res.json(data);
        } else {
            res.status(404).json({ error: 'Cache file not found' });
        }
    } catch (err) {
        console.error('Cache read error:', err);
        res.status(500).json({ error: 'Failed to read cache' });
    }
});

// SETTINGS API
app.get('/api/settings', (req, res) => {
    try {
        const config = getEnvConfig();
        // Mask sensitive tokens for the frontend
        const maskedConfig = { ...config };
        const sensitiveKeys = ['TMDB_TOKEN', 'ANILIST_TOKEN'];
        sensitiveKeys.forEach(key => {
            if (maskedConfig[key]) maskedConfig[key] = '••••••••••••••••';
        });
        res.json(maskedConfig);
    } catch (err) {
        res.status(500).json({ error: 'Failed to read settings' });
    }
});

app.post('/api/settings', async (req, res) => {
    try {
        const newSettings = req.body;
        const currentConfig = getEnvConfig();
        
        // Merge settings, but handle masked tokens
        const finalConfig = { ...currentConfig, ...newSettings };
        
        // Re-apply original tokens if they were sent as masked
        const sensitiveKeys = ['TMDB_TOKEN', 'ANILIST_TOKEN'];
        sensitiveKeys.forEach(key => {
            if (newSettings[key] === '••••••••••••••••') {
                finalConfig[key] = currentConfig[key];
            }
        });

        // Ensure directory exists
        fs.ensureDirSync(MT_CONFIG_DIR);

        // Write back to .env
        const envContent = Object.entries(finalConfig)
            .map(([key, value]) => `${key}="${value}"`)
            .join('\n');
        
        fs.writeFileSync(ENV_PATH, envContent + '\n');
        
        // Update live token
        if (finalConfig.TMDB_TOKEN) {
            TMDB_TOKEN = finalConfig.TMDB_TOKEN;
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save settings' });
    }
});

// SSE for streaming terminal output
app.get('/api/terminal/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    const listener = (data) => send({ type: 'output', data });
    const errorListener = (data) => send({ type: 'error', data });
    const exitListener = (code) => send({ type: 'exit', code });

    bus.on('output', listener);
    bus.on('error', errorListener);
    bus.on('exit', exitListener);

    req.on('close', () => {
        bus.off('output', listener);
        bus.off('error', errorListener);
        bus.off('exit', exitListener);
    });
});

app.post('/api/open', (req, res) => {
    const { filePath, type } = req.body;
    if (!filePath || !fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
    }

    const ext = path.extname(filePath).toLowerCase();
    let appName = 'VLC'; // Default

    if (type === 'book' || ['.pdf', '.epub', '.cbr', '.cbz'].includes(ext)) {
        if (ext === '.pdf') appName = 'Preview';
        else if (ext === '.epub') appName = 'Books';
        else if (['.cbr', '.cbz'].includes(ext)) appName = 'Simple Comic';
        else appName = 'Books'; // Fallback for other book types
    }

    const cmd = `open -a ${escapeShell(appName)} ${escapeShell(filePath)}`;
    console.log(`Executing: ${cmd}`);
    spawn(cmd, { shell: '/bin/bash' });
    res.json({ success: true, app: appName });
});

app.post('/api/open-vlc', (req, res) => {
    const { filePath } = req.body;
    if (!filePath || !fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
    }
    const cmd = `open -a VLC ${escapeShell(filePath)}`;
    console.log(`Executing: ${cmd}`);
    spawn(cmd, { shell: '/bin/bash' });
    res.json({ success: true });
});

app.post('/api/open-vlc-episode', async (req, res) => {
    try {
        const { mediaId, episodeNumber, seasonNumber } = req.body;
        const data = await fs.readJson(LIBRARY_FILE);
        const item = data.media.find(m => m.id === mediaId);
        
        if (!item || !item.local?.path) {
            return res.status(404).json({ error: 'Media or local path not found' });
        }
        
        let targetPath = item.local.path;

        // If it is just an index item, try loading the sidecar for custom episode paths
        const filename = getMediaFilename(mediaId);
        const sidecarPath = path.join(MEDIA_DIR, filename);
        let userEp = null;
        if (await fs.pathExists(sidecarPath)) {
            const sidecar = await fs.readJson(sidecarPath);
            const epKey = `${seasonNumber || 0}_${episodeNumber}`;
            if (sidecar.userEpisodes && sidecar.userEpisodes[epKey]) {
                userEp = sidecar.userEpisodes[epKey];
                if (userEp.path && fs.existsSync(userEp.path)) {
                    targetPath = userEp.path;
                }
            }
        }
        
        if (!fs.existsSync(targetPath)) {
            return res.status(404).json({ error: 'Base path does not exist' });
        }

        const stat = fs.lstatSync(targetPath);
        
        if (stat.isDirectory()) {
            // Find episode file in directory
            // We use standard fs because readdir recursive is newer
            const getAllFiles = (dirPath, arrayOfFiles) => {
                const files = fs.readdirSync(dirPath);
                arrayOfFiles = arrayOfFiles || [];
                files.forEach((file) => {
                    if (file.startsWith('.')) return; // Skip hidden
                    const filePath = path.join(dirPath, file);
                    if (fs.statSync(filePath).isDirectory()) {
                        arrayOfFiles = getAllFiles(filePath, arrayOfFiles);
                    } else {
                        arrayOfFiles.push(filePath);
                    }
                });
                return arrayOfFiles;
            };

            const files = getAllFiles(targetPath);
            
            const s = seasonNumber ? seasonNumber.toString().padStart(2, '0') : null;
            const e = episodeNumber.toString().padStart(2, '0');
            
            let match = null;
            
            // 1. Look for S01E01 style or 1x01
            if (s) {
                match = files.find(f => {
                    const name = path.basename(f).toLowerCase();
                    return name.includes(`s${s}e${e}`) || name.includes(`${seasonNumber}x${e}`);
                });
            }
            
            // 2. Look for E01 or episode number in filename
            if (!match) {
                match = files.find(f => {
                    const name = path.basename(f).toLowerCase();
                    // Match " e01", "-01", " 01 ", etc.
                    const patterns = [
                        `e${e}`,
                        `episode ${episodeNumber}`,
                        ` - ${e}`,
                        ` - ${episodeNumber}`,
                        ` ${e} `,
                        ` ${episodeNumber} `
                    ];
                    return patterns.some(p => name.includes(p)) || 
                           name.startsWith(`${e} `) || 
                           name.startsWith(`${episodeNumber} `);
                });
            }
            
            if (match) {
                targetPath = match;
            } else {
                return res.status(404).json({ error: `Could not find file for Episode ${episodeNumber}` });
            }
        }
        
        const config = getEnvConfig();
        const playerCmd = config.PLAYER_CMD || 'open -a VLC';
        const cmd = `${playerCmd} ${escapeShell(targetPath)}`;
        console.log(`Executing: ${cmd}`);
        spawn(cmd, { shell: '/bin/bash' });
        res.json({ success: true, path: targetPath });
    } catch (err) {
        console.error('Failed to open episode:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/open-mt-add', (req, res) => {
    const script = `
        tell application "iTerm"
            activate
            if not (exists window 1) then
                create window with default profile
            else
                tell current window
                    create tab with default profile
                end tell
            end if
            tell current window
                tell current session
                    write text "~/.local/bin/mt-add " without newline
                end tell
            end tell
        end tell
    `;
    spawn('osascript', ['-e', script]);
    res.json({ success: true });
});


// Delete media via mt-remove script
app.delete('/api/media/:id', (req, res) => {
    const { id } = req.params;
    const cmd = `~/.local/bin/mt-remove --id ${escapeShell(id)}`;
    console.log(`Executing: ${cmd}`);
    spawn(cmd, { shell: '/bin/bash' });
    res.json({ success: true });
});

app.post('/api/sync', (req, res) => {
    if (activeProcess) {
        return res.status(400).json({ error: 'Sync is already running' });
    }

    let finalPath = path.join(BIN_DIR, 'mt-info');
    
    if (!fs.existsSync(finalPath)) {
        finalPath = path.join(HOME_BIN, 'mt-info');
    }

    if (!fs.existsSync(finalPath)) {
        return res.status(404).json({ error: `mt-info script not found` });
    }

    console.log(`Executing sync: ${finalPath}`);
    
    const env = { 
        ...process.env, 
        DATA_DIR, 
        PATH: `${BIN_DIR}:${HOME_BIN}:${process.env.PATH}`, 
        TERM: 'xterm-256color',
        GUI: 'true'
    };

    activeProcess = spawn(finalPath, [], { env });

    let stdoutBuffer = '';
    activeProcess.stdout.on('data', (data) => {
        stdoutBuffer += data.toString();
        const lines = stdoutBuffer.split('\n');
        stdoutBuffer = lines.pop();
        lines.forEach(line => bus.emit('output', line));
    });

    let stderrBuffer = '';
    activeProcess.stderr.on('data', (data) => {
        stderrBuffer += data.toString();
        const lines = stderrBuffer.split('\n');
        stderrBuffer = lines.pop();
        lines.forEach(line => bus.emit('error', line));
    });

    activeProcess.on('close', (code) => {
        if (stdoutBuffer) bus.emit('output', stdoutBuffer);
        if (stderrBuffer) bus.emit('error', stderrBuffer);
        
        bus.emit('exit', code);
        activeProcess = null;
    });

    res.json({ success: true });
});

app.post('/api/terminal/input', (req, res) => {
    if (!activeProcess) {
        return res.status(400).json({ error: 'No active process' });
    }
    const { input } = req.body;
    activeProcess.stdin.write(input + '\n');
    res.json({ success: true });
});

app.get('/api/browse', async (req, res) => {
    try {
        let currentPath = req.query.path || process.env.HOME || '/';
        
        // Ensure path is absolute
        if (!path.isAbsolute(currentPath)) {
            currentPath = path.resolve(DATA_DIR, currentPath);
        }

        if (!fs.existsSync(currentPath)) {
            return res.status(404).json({ error: 'Path not found' });
        }

        const stat = fs.statSync(currentPath);
        if (!stat.isDirectory()) {
            // If it's a file, browse its parent
            currentPath = path.dirname(currentPath);
        }

        const entries = fs.readdirSync(currentPath, { withFileTypes: true })
            .filter(entry => !entry.name.startsWith('.'));
            
        const items = entries.map(entry => ({
            name: entry.name,
            path: path.join(currentPath, entry.name),
            isDirectory: entry.isDirectory(),
            isFile: entry.isFile()
        })).sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name);
        });

        res.json({
            currentPath,
            parentPath: path.dirname(currentPath),
            items
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/sync-progress', async (req, res) => {
    try {
        const libraryData = await fs.readJson(LIBRARY_FILE);
        let changed = false;

        // 1. VLC Sync
        const vlcScript = `
            tell application "VLC"
                if it is running then
                    try
                        set currentItemName to name of current item
                        set currentTimeValue to currentTime
                        set totalTimeValue to duration of current item
                        return currentItemName & "|" & currentTimeValue & "|" & totalTimeValue
                    on error
                        return ""
                    end try
                end if
            end tell
        `;
        
        const vlcOut = await new Promise(resolve => {
            const proc = spawn('osascript', ['-e', vlcScript]);
            let out = '';
            proc.stdout.on('data', d => out += d.toString());
            proc.on('close', () => resolve(out.trim()));
        });

        if (vlcOut && vlcOut.includes('|')) {
            const [name, current, total] = vlcOut.split('|');
            // Find item in library that matches this name in its local path
            const item = libraryData.media.find(m => m.local?.path && m.local.path.includes(name));
            if (item && item.type === 'movie') {
                const curMin = Math.floor(parseFloat(current) / 60);
                const totMin = Math.floor(parseFloat(total) / 60);
                
                if (curMin > 0 && (item.progress.current !== curMin || item.progress.total !== totMin)) {
                    item.progress.current = curMin;
                    item.progress.total = totMin;
                    item.progress.unit = "min";
                    item.status = 'watching';
                    changed = true;
                    
                    // Also update the full document
                    const filename = getMediaFilename(item.id);
                    const fullPath = path.join(MEDIA_DIR, filename);
                    if (fs.existsSync(fullPath)) {
                        const fullItem = await fs.readJson(fullPath);
                        fullItem.progress.current = curMin;
                        fullItem.progress.total = totMin;
                        fullItem.progress.unit = "min";
                        fullItem.status = 'watching';
                        await fs.writeJson(fullPath, fullItem, { spaces: 2 });
                    }
                }
            }
        }

        // 2. Apple Books Sync (Database-based)
        try {
            const dbDir = path.join(process.env.HOME, 'Library/Containers/com.apple.iBooksX/Data/Documents/BKLibrary');
            const dbs = fs.readdirSync(dbDir).filter(f => f.startsWith('BKLibrary') && f.endsWith('.sqlite'));
            
            if (dbs.length > 0) {
                // Pick the most recently modified database
                const latestDb = dbs.map(name => ({
                    name,
                    time: fs.statSync(path.join(dbDir, name)).mtime.getTime()
                })).sort((a, b) => b.time - a.time)[0].name;
                
                const dbPath = path.join(dbDir, latestDb);
                const query = "SELECT ZTITLE, ZBOOKHIGHWATERMARKPROGRESS FROM ZBKLIBRARYASSET WHERE ZLASTOPENDATE > 0 ORDER BY ZLASTOPENDATE DESC LIMIT 1";
                
                const dbOut = await new Promise(resolve => {
                    const proc = spawn('sqlite3', [dbPath, query]);
                    let out = '';
                    proc.stdout.on('data', d => out += d.toString());
                    proc.on('close', () => resolve(out.trim()));
                });

                if (dbOut && dbOut.includes('|')) {
                    const [title, progress] = dbOut.split('|');
                    const progressFloat = parseFloat(progress);
                    
                    const item = libraryData.media.find(m => 
                        m.type === 'book' && 
                        (m.title.toLowerCase() === title.toLowerCase() || title.includes(m.title))
                    );

                    if (item && progressFloat > 0) {
                        const total = item.progress.total || 1;
                        const current = Math.round(progressFloat * total);
                        
                        if (current > item.progress.current) {
                            item.progress.current = current;
                            item.status = 'watching';
                            changed = true;
                            
                            // Also update the full document
                            const filename = getMediaFilename(item.id);
                            const fullPath = path.join(MEDIA_DIR, filename);
                            if (fs.existsSync(fullPath)) {
                                const fullItem = await fs.readJson(fullPath);
                                fullItem.progress.current = current;
                                fullItem.status = 'watching';
                                await fs.writeJson(fullPath, fullItem, { spaces: 2 });
                            }
                        }
                    }
                }
            }
        } catch (e) {
            console.error('Apple Books DB sync failed:', e);
        }

        if (changed) {
            await fs.writeJson(LIBRARY_FILE, libraryData, { spaces: 2 });
        }

        res.json({ success: true, changed });
    } catch (err) {
        console.error('Progress sync failed:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/terminal/kill', (req, res) => {
    if (activeProcess) {
        activeProcess.kill('SIGTERM');
        res.json({ success: true });
    } else {
        res.status(400).json({ error: 'No active process' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Library linked to: ${LIBRARY_FILE}`);
    console.log(`Using scripts from: ${BIN_DIR}`);
});
