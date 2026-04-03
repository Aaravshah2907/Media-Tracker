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

// Load TMDB Token from .env manually
let TMDB_TOKEN = '';
const ENV_PATH = path.join(process.env.HOME, '.config/mt/.env');
if (fs.existsSync(ENV_PATH)) {
    const envContent = fs.readFileSync(ENV_PATH, 'utf8');
    const match = envContent.match(/TMDB_TOKEN=["']?([^"'\n]+)["']?/);
    if (match) TMDB_TOKEN = match[1];
}

// Paths - Prefer DATA_DIR environment variable
const DATA_DIR = process.env.DATA_DIR || path.join(process.env.HOME, 'Documents/Personal/Tracker');
const LIBRARY_FILE = path.join(DATA_DIR, 'library.json');
const CACHE_DIR = path.join(DATA_DIR, 'cache');
const PENDING_FILE = path.join(CACHE_DIR, 'pending.json');

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

// Search Proxy API
app.get('/api/search/:type/:query', async (req, res) => {
    const { type, query } = req.params;
    const q = encodeURIComponent(query);
    
    try {
        let results = [];
        if (type === 'movie') {
            const tmdbRes = await axios.get(`https://api.themoviedb.org/3/search/movie?query=${q}`, {
                headers: { Authorization: `Bearer ${TMDB_TOKEN}` }
            });
            results = tmdbRes.data.results.map(r => ({
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
            results = tvRes.data.map(r => ({
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
            results = aniRes.data.data.map(r => ({
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
            subtype: item.type === 'tv' ? 'series' : (item.type === 'movie' ? null : null),
            status: "planned",
            progress: { 
                current: 0, 
                total: totalEpisodes || (item.type === 'movie' ? 1 : 0), 
                unit: item.type === 'movie' ? "scene" : (item.type === 'book' ? "page" : "episode") 
            },
            seasons: (item.type === 'tv' || item.type === 'anime') ? { current: 1, total: totalSeasonsCount } : null,
            metadata: { 
                year: parseInt(item.year) || null,
                release_date: item.release_date || null,
                genres: []
            },
            source: item.source,
            local: { path: "", available: false },
            timestamps: { added: now, updated: now },
            poster_path: item.poster_path, 
            vote_average: item.vote_average,
            overview: item.overview,
            original_title: item.title,
            original_language: "en",
            popularity: 0
        };
        
        // Prevent duplicates
        if (!data.media.some(m => m.id === newItem.id)) {
            data.media.push(newItem);
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
        const data = await fs.readFile(LIBRARY_FILE, 'utf8');
        res.json(JSON.parse(data));
    } catch (err) {
        res.status(500).json({ error: 'Failed to read library' });
    }
});

app.post('/api/library', async (req, res) => {
    try {
        await fs.writeFile(LIBRARY_FILE, JSON.stringify(req.body, null, 2), 'utf8');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update library' });
    }
});

app.get('/api/cache/:type/:id', async (req, res) => {
    try {
        const { type, id } = req.params;
        const filename = id.replace(/[:\/]/g, '_') + '.json';
        const filePath = path.join(CACHE_DIR, type, filename);
        
        if (await fs.pathExists(filePath)) {
            const data = await fs.readFile(filePath, 'utf8');
            res.json(JSON.parse(data));
        } else {
            res.status(404).json({ error: 'Cache file not found' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to read cache' });
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
