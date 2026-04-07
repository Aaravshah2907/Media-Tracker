import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Search, Loader2, Edit3, X, Save, ExternalLink, RefreshCw, Send, ZapOff, CheckCircle, Folder, Play, Download, PlusCircle, Trash2, Plus, Filter, Link as LinkIcon, BookOpen, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = 'http://localhost:3001/api';

const App = () => {
  const [library, setLibrary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [activeTab, setActiveTab] = useState('movie');
  const [selectedItem, setSelectedItem] = useState(null);
  const [editing, setEditing] = useState(false);
  const [selectedCache, setSelectedCache] = useState(null);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [showLocalOnly, setShowLocalOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [minRatingFilter, setMinRatingFilter] = useState(0);
  const [brandFilter, setBrandFilter] = useState('all');
  const [syncing, setSyncing] = useState(false);
  const [syncingProgress, setSyncingProgress] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({});
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [browserContext, setBrowserContext] = useState(null); // 'media' or field key like 'MOVIES_PATH'


  // INITIAL LOAD: Run mt-info silently if enabled
  useEffect(() => {
    fetchSettings().then(() => {
        fetchLibrary();
    });
  }, []);

  // When settings are loaded, check if we should run sync
  useEffect(() => {
    if (settings.AUTO_REFRESH !== 'false' && settings.AUTO_REFRESH !== undefined) {
      runSync();
    }
  }, [settings.AUTO_REFRESH === undefined]); // This will trigger once it's loaded

  const fetchSettings = async () => {
    try {
      const res = await axios.get(`${API_BASE}/settings`);
      setSettings(res.data);
    } catch (e) {
      console.error('Failed to fetch settings');
    }
  };

  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    try {
      await axios.post(`${API_BASE}/settings`, settings);
      setShowSettings(false);
      // Re-fetch lib in case keys changed
      fetchLibrary();
    } catch (e) {
      alert('Failed to save settings');
    } finally {
      setIsSavingSettings(false);
    }
  };


  const runSync = async () => {
    setSyncing(true);
    try {
      await axios.post(`${API_BASE}/sync`);
      setTimeout(() => {
        fetchLibrary();
        setSyncing(false);
      }, 5000); // Wait for script to start/progress
    } catch (err) {
      console.error('Sync failed', err);
      setSyncing(false);
    }
  };

  const syncPlayerProgress = async () => {
    setSyncingProgress(true);
    try {
      const res = await axios.post(`${API_BASE}/sync-progress`);
      if (res.data.changed) {
        fetchLibrary();
      }
    } catch (e) {
      console.error('Progress sync failed');
    } finally {
      setSyncingProgress(false);
    }
  };

  const fetchCacheOnSelect = async (item) => {
    if (!item) return;
    try {
      const res = await axios.get(`${API_BASE}/cache/${item.type}/${item.id}`);
      let data = res.data;

      // Jikan Enrichment for Anime
      if (item.type === 'anime') {
        let malId = data.data?.Media?.idMal || data.source?.id;
        if (!malId && item.id.startsWith('mal:')) {
          malId = item.id.split(':')[1];
        }

        if (malId) {
          try {
            // Try mal_ prefixed file first, then jikan_
            const jikanRes = await axios.get(`${API_BASE}/cache/anime/mal_${malId}`).catch(() => axios.get(`${API_BASE}/cache/anime/jikan_${malId}`));
            const jikanEps = await axios.get(`${API_BASE}/cache/anime/mal_${malId}_episodes`).catch(() => axios.get(`${API_BASE}/cache/anime/jikan_${malId}_episodes`));

            // Jikan structures data inside a "data" object
            const mainData = jikanRes.data.data || jikanRes.data;
            const epData = jikanEps.data.data || jikanEps.data;

            data = {
              ...data,
              jikan: mainData,
              jikanEpisodes: Array.isArray(epData) ? epData : (epData?.data || [])
            };
          } catch (e) { /* ignore fallback */ }
        }
      }
      setSelectedCache(data);
    } catch (e) {
      setSelectedCache(null);
    }
  };

  useEffect(() => {
    if (selectedItem) {
      fetchCacheOnSelect(selectedItem);
    } else {
      setSelectedCache(null);
    }
  }, [selectedItem?.id]); // Only reset/fetch when the MEDIA ID changes, not on every data update

  const fetchLibrary = async () => {
    try {
      const res = await axios.get(`${API_BASE}/library`);
      const mediaItems = res.data.media || [];
      setLibrary(mediaItems);
      setLoading(false);

      // Gradually enhance
      mediaItems.forEach(async (item, index) => {
        if (!item.poster_path || !item.rating) {
          try {
            const cacheRes = await axios.get(`${API_BASE}/cache/${item.type}/${item.id}`);
            const data = cacheRes.data;
            let poster = null;
            let rating = null;

            if (item.type === 'anime' || item.type === 'manga') {
              poster = data.data?.Media?.coverImage?.extraLarge ||
                data.data?.Media?.coverImage?.large ||
                data.images?.jpg?.large_image_url ||
                data.data?.images?.jpg?.large_image_url;

              if (data.data?.score) rating = data.data.score;
              else if (data.data?.Media?.averageScore) rating = data.data.Media.averageScore / 10;
              else if (data.score) rating = data.score;
            } else if (item.type === 'tv') {
              poster = data.image?.original || data.image?.medium;
              if (data.rating?.average) rating = data.rating.average;
            } else if (item.type === 'movie') {
              poster = data.poster_path ? `https://image.tmdb.org/t/p/w780${data.poster_path}` : null;
              if (data.vote_average) rating = data.vote_average;
            } else if (item.type === 'book') {
              poster = data.volumeInfo?.imageLinks?.thumbnail || data.volumeInfo?.imageLinks?.smallThumbnail;
              if (!poster && data.covers && data.covers.length > 0 && data.covers[0] !== -1) {
                poster = `https://covers.openlibrary.org/b/id/${data.covers[0]}-L.jpg`;
              }
            }

            if (poster || rating || data.episodes || (data._embedded?.episodes && data._embedded.episodes.length > 0)) {
              setLibrary(prev => {
                const nextIdx = prev.findIndex(it => it.id === item.id);
                if (nextIdx === -1) return prev;
                const next = [...prev];
                const updatedItem = { ...next[nextIdx] };
                let changed = false;

                if (poster && !updatedItem.poster_path) { updatedItem.poster_path = poster; changed = true; }
                if (rating && !updatedItem.rating) { updatedItem.rating = rating; changed = true; }

                // Hydrate totals for TV/Anime
                if (item.type === 'anime' || item.type === 'tv') {
                  // Jikan Anime
                  const malEps = data.data?.episodes || data.episodes;
                  if (item.type === 'anime' && malEps && !updatedItem.progress.total) {
                    updatedItem.progress.total = malEps;
                    changed = true;
                  }
                  // TVMaze Seasons/Episodes
                  if (item.type === 'tv' && data._embedded?.episodes) {
                    const episodes = data._embedded.episodes;
                    const seasonsCount = [...new Set(episodes.map(e => e.season))].length;
                    if (!updatedItem.progress.total || updatedItem.progress.total === 0) {
                      updatedItem.progress.total = episodes.length;
                      changed = true;
                    }
                    if (!updatedItem.seasons || !updatedItem.seasons.total) {
                      updatedItem.seasons = { current: updatedItem.seasons?.current || 0, total: seasonsCount };
                      changed = true;
                    }
                  }
                }

                if (changed) {
                  next[nextIdx] = updatedItem;
                  // Save back eventually or at least update local state
                  return next;
                }
                return prev;
              });
            }
          } catch (e) { /* silent */ }
        }
      });
    } catch (err) {
      console.error('Failed to fetch library', err);
      setLoading(false);
    }
  };

  const handleSelectItem = async (minimalItem) => {
    if (!minimalItem) {
      setSelectedItem(null);
      return;
    }
    try {
      const res = await axios.get(`${API_BASE}/media/${minimalItem.id}`);
      const fullItem = res.data;
      setSelectedItem(fullItem);
      // Smart season selection: Show the season they are currently watching
      if (fullItem.seasons?.current) {
        setSelectedSeason(fullItem.seasons.current);
      }
    } catch (e) {
      setSelectedItem(minimalItem);
      if (minimalItem.seasons?.current) {
        setSelectedSeason(minimalItem.seasons.current);
      }
    }
  };

  const closeModal = () => {
    setSelectedItem(null);
    setEditing(false);
    runSync(); // Silent Refresh on close
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this from your library AND cache?")) return;
    try {
      await axios.delete(`${API_BASE}/media/${id}`);
      fetchLibrary(); // Refresh UI
    } catch (err) {
      alert("Failed to delete item: " + (err.response?.data?.error || err.message));
    }
  };

  const handleBulkProgress = async (item, epNumber) => {
    try {
      const nextLibrary = library.map(it => {
        if (it.id === item.id) {
          return { ...it, progress: { ...it.progress, current: epNumber } };
        }
        return it;
      });
      setLibrary(nextLibrary);
      await axios.post(`${API_BASE}/library`, { media: nextLibrary });
      
      // Also mark this specific episode as watched in the sidecar
      await handleToggleEpisodeWatched(item.id, epNumber, selectedSeason, true);
    } catch (e) {
      console.error('Bulk update failed');
    }
  };

  const handleToggleEpisodeWatched = async (mediaId, number, season, watched) => {
    try {
      const res = await axios.post(`${API_BASE}/media/${mediaId}/batch-episodes`, {
        episodes: [{ number, season, watched }]
      });
      if (selectedItem && selectedItem.id === mediaId) {
        setSelectedItem({ ...selectedItem, userEpisodes: res.data.userEpisodes, progress: res.data.progress });
      }
      fetchLibrary();
    } catch (e) {
      console.error('Toggle episode watched failed');
    }
  };

  const handleToggleSeasonWatched = async (mediaId, seasonEpisodes, isWatched) => {
    try {
      const episodes = seasonEpisodes.map(ep => ({
        number: ep.number || ep.mal_id,
        season: ep.season || selectedSeason,
        watched: isWatched
      }));
      
      const res = await axios.post(`${API_BASE}/media/${mediaId}/batch-episodes`, { episodes });
      if (selectedItem && selectedItem.id === mediaId) {
        setSelectedItem({ ...selectedItem, userEpisodes: res.data.userEpisodes, progress: res.data.progress });
      }
      fetchLibrary();
    } catch (e) {
      console.error('Season toggle failed');
    }
  };

  const handleLinkEpisodePath = async (mediaId, number, season) => {
    const filePath = window.prompt("Enter absolute path for this episode file:");
    if (!filePath) return;
    
    try {
      const res = await axios.post(`${API_BASE}/media/${mediaId}/batch-episodes`, {
        episodes: [{ number, season, path: filePath }]
      });
      if (selectedItem && selectedItem.id === mediaId) {
        setSelectedItem({ ...selectedItem, userEpisodes: res.data.userEpisodes });
      }
    } catch (e) {
      alert("Failed to link episode path");
    }
  };

  const handleWebSearch = async (query) => {
    if (!query) return;
    setIsSearching(true);
    try {
      const res = await axios.get(`${API_BASE}/search/${activeTab}/${query}`);
      setSearchResults(res.data);
      setIsSearching(false);
    } catch (e) {
      setIsSearching(false);
    }
  };

  const handleWebAdd = async (item) => {
    try {
      await axios.post(`${API_BASE}/add-to-library`, item);
      await fetchLibrary(); // Refresh
      setSearchResults([]); // Close
      setSearch('');
      // Background enrichment
      axios.post(`${API_BASE}/sync`);
    } catch (e) {
      console.error('Web add failed');
    }
  };

  const getImageUrl = (item) => {
    if (!item || !item.poster_path) return 'https://via.placeholder.com/500x750?text=No+Image';
    if (item.poster_path.startsWith('http')) {
      // Upgrade AniList images to large if possible (if captured as medium)
      if (item.poster_path.includes('anilist.co') && item.poster_path.includes('/medium/')) {
        return item.poster_path.replace('/medium/', '/large/');
      }
      return item.poster_path;
    }
    // TMDb - Upgrade w500 to w780 for higher quality
    return `https://image.tmdb.org/t/p/w780${item.poster_path}`;
  };

  const safeLibrary = Array.isArray(library) ? library : [];

  const filteredLibrary = safeLibrary.filter(item => {
    const matchesSearch = item?.title?.toLowerCase().includes((search || '').toLowerCase()) ||
      item?.type?.toLowerCase().includes((search || '').toLowerCase());
    const matchesLocal = showLocalOnly ? item?.local?.available : true;
    const matchesStatus = statusFilter === 'all' ? true : item?.status?.toLowerCase() === statusFilter.toLowerCase();
    const matchesRating = minRatingFilter === 0 ? true : (item?.rating >= minRatingFilter);
    const matchesBrand = brandFilter === 'all' ? true : item?.brand === brandFilter;
    return matchesSearch && matchesLocal && matchesStatus && matchesRating && matchesBrand;
  });

  const uniqueBrands = Array.from(new Set(safeLibrary.map(i => i.brand).filter(Boolean))).sort();

  const handleSave = async (updatedItem) => {
    const newLibrary = { media: safeLibrary.map(it => it.id === updatedItem.id ? updatedItem : it) };
    try {
      await axios.post(`${API_BASE}/library`, newLibrary);
      setLibrary(newLibrary.media);
      setSelectedItem(updatedItem);
      setEditing(false);
    } catch (err) {
      alert('Failed to save library');
    }
  };

  const groupedLibrary = filteredLibrary.reduce((acc, item) => {
    const type = item?.type || 'unknown';
    if (!acc[type]) acc[type] = [];
    acc[type].push(item);
    return acc;
  }, {});

  // Sort items within each type by full release date descending (newest first)
  Object.keys(groupedLibrary).forEach(type => {
    groupedLibrary[type].sort((a, b) => {
      const dateA = a.metadata?.release_date || a.metadata?.year || "0";
      const dateB = b.metadata?.release_date || b.metadata?.year || "0";

      // LocalCompare works for YYYY-MM-DD strings
      return dateB.toString().localeCompare(dateA.toString());
    });
  });

  const orderOfTypes = ['movie', 'anime', 'tv', 'manga', 'book', 'series'];
  const sortedTypes = Object.keys(groupedLibrary).sort((a, b) => {
    const ia = orderOfTypes.indexOf(a);
    const ib = orderOfTypes.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  const getSeasons = () => {
    if (!selectedItem || !selectedCache) return [];
    if (selectedItem.type === 'anime' && selectedCache.jikanEpisodes) return [1];
    if (selectedItem.type !== 'tv') return [];
    const episodes = selectedCache._embedded?.episodes || [];
    const seasons = [...new Set(episodes.map(ep => ep.season))];
    return seasons;
  };

  const getEpisodesBySeason = (season) => {
    if (!selectedItem || !selectedCache) return null;

    // Jikan Anime Logic
    if (selectedItem.type === 'anime') {
      const eps = selectedCache.jikanEpisodes || [];
      // If episodes are empty but we have a single item (like a movie)
      if (eps.length === 0 && selectedItem.progress?.total <= 1) {
        return [{
          mal_id: 1,
          title: selectedItem.title,
          synopsis: selectedCache.jikan?.synopsis || selectedItem.overview,
          aired: selectedItem.metadata?.release_date,
          image: { original: getImageUrl(selectedItem) }
        }];
      }
      return eps;
    }

    if (selectedItem.type !== 'tv') return null;
    return selectedCache._embedded?.episodes?.filter(ep => ep.season === season);
  };

  const [showFileBrowser, setShowFileBrowser] = useState(false);
  const [browserData, setBrowserData] = useState({ items: [], currentPath: '' });

  const fetchBrowserData = async (path = '') => {
    try {
      const res = await axios.get(`${API_BASE}/browse`, { params: { path } });
      setBrowserData(res.data);
    } catch (err) {
      console.error("Failed to fetch browser data", err);
    }
  };

  const FileBrowser = () => {
    if (!showFileBrowser) return null;

    return (
      <div className="modal-overlay" style={{ zIndex: 3000 }} onClick={() => setShowFileBrowser(false)}>
        <motion.div
          className="modal-content"
          style={{ maxWidth: '600px', height: '80vh', display: 'flex', flexDirection: 'column' }}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 className="section-title" style={{ marginBottom: 0 }}>Browse Filesystem</h3>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                className="btn btn-primary"
                style={{ padding: '8px 16px', fontSize: '12px' }}
                onClick={async () => {
                  const path = browserData.currentPath;
                  if (browserContext && browserContext !== 'media') {
                    setSettings({ ...settings, [browserContext]: path });
                  } else {
                    const updatedItem = { ...selectedItem, local: { ...selectedItem.local, path: path, available: true } };
                    setSelectedItem(updatedItem);
                    if (!editing) await handleSave(updatedItem);
                  }
                  setShowFileBrowser(false);
                  setBrowserContext(null);
                }}
              >
                Select Current Folder
              </button>
              <button className="close-btn" style={{ position: 'static', padding: '5px' }} onClick={() => setShowFileBrowser(false)}><X /></button>
            </div>
          </div>

          <div className="browser-addr">
            <button className="icon-btn" style={{ width: '30px', height: '30px', borderRadius: '8px' }} onClick={() => fetchBrowserData(browserData.parentPath)} title="Go Up"><X style={{ transform: 'rotate(90deg)' }} size={14} /></button>
            <span>{browserData.currentPath}</span>
          </div>

          <div className="browser-list">
            {browserData.items.map((item, idx) => (
              <div
                key={idx}
                className="browser-item"
                onClick={async () => {
                  const newPath = item.path;
                  const updatedItem = { ...selectedItem, local: { ...selectedItem.local, path: newPath, available: true } };
                  
                  if (item.isDirectory) {
                    fetchBrowserData(newPath);
                  } else {
                    setSelectedItem(updatedItem);
                    setShowFileBrowser(false);
                    // Automatic Save if not in explicit editing mode
                    if (!editing) {
                      await handleSave(updatedItem);
                    }
                  }
                }}
              >
                {item.isDirectory ? <Folder size={18} style={{ color: '#64ffda' }} /> : <Play size={18} style={{ opacity: 0.5 }} />}
                <span>{item.name}</span>
                {item.isDirectory && (
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '4px 8px', fontSize: '11px', whiteSpace: 'nowrap' }}
                    onClick={async (e) => {
                      e.stopPropagation();
                      const path = item.path;
                      if (browserContext && browserContext !== 'media') {
                        setSettings({ ...settings, [browserContext]: path });
                      } else {
                        const updatedItem = { ...selectedItem, local: { ...selectedItem.local, path: path, available: true } };
                        setSelectedItem(updatedItem);
                        if (!editing) await handleSave(updatedItem);
                      }
                      setShowFileBrowser(false);
                      setBrowserContext(null);
                    }}
                  >
                    Select
                  </button>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    );
  };

  const seasons = getSeasons();
  const currentEpisodes = getEpisodesBySeason(selectedSeason);

  return (
    <div className="app-container">
      <FileBrowser />
      <header className="header" style={{ padding: '25px 5%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
        <div className="discovery-island">
          <div className="search-group">
            <div className="search-addon"><Search size={18} /></div>
            <input
              type="text"
              className="island-input"
              placeholder="Search or add..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleWebSearch(search);
              }}
            />
            <select
              className="island-select"
              value={activeTab}
              onChange={(e) => setActiveTab(e.target.value)}
              title="Select Search Type"
            >
              <option value="movie">Movies</option>
              <option value="tv">TV Shows</option>
              <option value="anime">Anime</option>
              <option value="manga">Manga</option>
              <option value="book">Books</option>
            </select>
            <button className="island-btn primary" onClick={() => handleWebSearch(search)} title="Search/Add Discovery">
              <Plus size={20} />
            </button>
          </div>
        </div>

        <div className="curation-island">
          <div className="filter-group">
            <div className="search-addon"><Filter size={18} /></div>
            <select
              className="island-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              title="Filter by Status"
            >
              <option value="all">Any Status</option>
              <option value="planned">Planned</option>
              <option value="watching">Watching</option>
              <option value="caught up">Caught Up</option>
              <option value="completed">Completed</option>
              <option value="dropped">Dropped</option>
              <option value="paused">Paused</option>
            </select>

            <select
              className="island-select"
              value={minRatingFilter}
              onChange={(e) => setMinRatingFilter(Number(e.target.value))}
              title="Minimum Rating"
            >
              <option value={0}>Any Rating</option>
              <option value={7}>7.0+ ⭐</option>
              <option value={8}>8.0+ ⭐</option>
              <option value={9}>9.0+ ⭐</option>
            </select>

            <select
              className="island-select"
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              title="Filter by Studio/Publisher"
              style={{ minWidth: '150px' }}
            >
              <option value="all">Any Studio/Company</option>
              {uniqueBrands.map(b => <option key={b} value={b}>{b}</option>)}
            </select>

            <button
              className={`island-btn ${showLocalOnly ? 'active' : ''}`}
              onClick={() => setShowLocalOnly(!showLocalOnly)}
              title={showLocalOnly ? "Show All Media" : "Filter Local Only"}
              style={{ marginLeft: '10px' }}
            >
              <Download size={20} />
            </button>
          </div>

          <div className="sync-section">
            <button
              className={`icon-btn ${syncing ? 'spinning' : ''}`}
              onClick={() => runSync()}
              title={syncing ? "Syncing..." : "Refresh Metadata"}
              disabled={syncing}
            >
              {syncing ? <Loader2 size={18} className="loader" /> : <RefreshCw size={18} />}
            </button>
            <button
              className={`icon-btn ${syncingProgress ? 'spinning' : ''}`}
              onClick={() => syncPlayerProgress()}
              title={syncingProgress ? "Syncing Media Players..." : "Sync VLC/Books Progress"}
              disabled={syncingProgress}
              style={{ marginLeft: '10px' }}
            >
              <ZapOff size={18} style={{ color: syncingProgress ? '#64ffda' : 'inherit' }} />
            </button>
            <button
              className="icon-btn"
              onClick={() => setShowSettings(true)}
              title="Settings"
              style={{ marginLeft: '10px' }}
            >
              <Settings size={18} />
            </button>
          </div>
        </div>
      </header>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
          <Loader2 className="loader" size={48} />
        </div>
      ) : (
        <div className="sections-container">
          {sortedTypes.length === 0 ? (
            <div className="empty-state">
              <Loader2 className="loader" size={24} style={{ opacity: 0.2, marginBottom: 20 }} />
              <h3>No media found in your library.</h3>
              <p>Use your CLI tools to add media, then refresh!</p>
            </div>
          ) : (
            sortedTypes.map(type => (
              <motion.section
                key={type}
                className="media-section"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <h2 className="section-title">
                  {type.charAt(0).toUpperCase() + type.slice(1)}s
                  <span className="count-badge">{groupedLibrary[type].length}</span>
                </h2>
                <div className="media-grid">
                  <AnimatePresence>
                    {groupedLibrary[type].map((item) => (
                      <motion.div
                        key={item.id}
                        layout
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        whileHover={{ y: -10 }}
                        className={`media-card ${item.local?.available ? 'valid-path' : ''}`}
                        onClick={() => handleSelectItem(item)}
                      >
                        <div className="card-image-container">
                          <img src={getImageUrl(item)} alt={item.title} className="card-image" loading="lazy" />
                          <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 11 }}>
                            <span className="type-badge">{item.status}</span>
                          </div>
                          {item.rating && (
                            <div style={{ position: 'absolute', bottom: 10, right: 10, zIndex: 11 }}>
                              <span style={{ background: 'rgba(0,0,0,0.8)', color: '#FFD700', padding: '4px 8px', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold' }}>
                                ⭐ {Number(item.rating).toFixed(1)}/10
                              </span>
                            </div>
                          )}
                          <div className="play-overlay" style={{ gap: '15px' }}>
                              {item.local?.available ? (
                                <button
                                  className="play-circle"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    axios.post(`${API_BASE}/open`, { filePath: item.local.path, type: item.type });
                                  }}
                                  title={(item.type === 'book' || item.type === 'manga') ? "Resume Reading" : "Play Media"}
                                >
                                  {(item.type === 'book' || item.type === 'manga') ? <BookOpen size={24} /> : <Play fill="currentColor" size={24} style={{ marginLeft: '4px' }} />}
                                </button>
                              ) : (
                                <button
                                  className="play-circle outline"
                                  style={{ borderStyle: 'dashed', opacity: 0.8 }}
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    await handleSelectItem(item);
                                    setBrowserContext('media');
                                    const pathKey = item.type === 'movie' ? 'MOVIES_PATH' : (item.type === 'book' ? 'BOOKS_PATH' : `${item.type.toUpperCase()}_PATH`);
                                    const defaultPath = settings[pathKey];
                                    console.log(`Began Browse for ${item.type} using ${pathKey}: ${defaultPath}`);
                                    fetchBrowserData(defaultPath); 
                                    setShowFileBrowser(true);
                                  }}
                                  title="Link Local File/Folder"
                                >
                                  <Folder size={24} />
                                </button>
                              )}
                          </div>
                        </div>
                        <div className="card-content">
                          <h3 className="card-title">{item.title}</h3>
                          <div className="card-meta">
                            <span>{item.metadata?.year || 'N/A'}</span>
                            <span>•</span>
                            <span>
                              {item.progress.unit === 'min' ? (
                                item.progress.current > 0 ? `${item.progress.current}m / ${item.progress.total}m` : `${item.progress.total}m`
                              ) : (
                                `${item.progress.current} / ${item.progress.total || '?'} ${item.progress.unit}`
                              )}
                            </span>
                          </div>
                          <div className="progress-bar" style={{ marginTop: '5px' }}>
                            <div
                              className="progress-fill"
                              style={{ width: `${(item.progress.current / (item.progress.total || 1)) * 100}%` }}
                            ></div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </motion.section>
            ))
          )}
        </div>
      )}

      <AnimatePresence>
        {selectedItem && (
          <div className="modal-overlay" onClick={closeModal}>
            <motion.div
              className="modal-content"
              initial={{ opacity: 0, y: 50, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 50, scale: 0.9 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button className="close-btn" onClick={closeModal}><X /></button>

              <div className="modal-header">
                <img src={getImageUrl(selectedItem)} alt={selectedItem.title} className={`modal-poster ${selectedItem.local?.available ? 'valid' : ''}`} />
                <div className="modal-info">
                  <h2 className="modal-title">{selectedItem.title}</h2>
                  <div className="card-meta" style={{ marginBottom: 20 }}>
                    <span className="type-badge">{selectedItem.type}</span>
                    <span>{selectedItem.metadata?.year}</span>
                    <span>{selectedItem.status}</span>
                  </div>
                  {!editing ? (
                    <>
                      <div className="modal-overview" dangerouslySetInnerHTML={{ __html: selectedCache?.jikan?.synopsis || selectedCache?.data?.Media?.description || selectedItem?.overview }}></div>

                      {selectedItem.details && (
                        <div className="spec-details">
                          {selectedItem.type === 'movie' && (
                            <>
                              {selectedItem.details.runtime && <div className="spec-item"><span className="spec-label">Runtime</span> {selectedItem.details.runtime} min</div>}
                              {selectedItem.details.budget > 0 && <div className="spec-item"><span className="spec-label">Budget</span> ${selectedItem.details.budget?.toLocaleString()}</div>}
                              {selectedItem.details.tagline && <div className="spec-item" style={{ gridColumn: 'span 2' }}><span className="spec-label">Tagline</span> <i>"{selectedItem.details.tagline}"</i></div>}
                            </>
                          )}
                          {selectedItem.type === 'book' && (
                            <>
                              {selectedItem.details.authors?.length > 0 && <div className="spec-item" style={{ gridColumn: 'span 2' }}><span className="spec-label">Author(s)</span> {selectedItem.details.authors?.join(', ')}</div>}
                              {selectedItem.details.page_count && <div className="spec-item"><span className="spec-label">Pages</span> {selectedItem.details.page_count}</div>}
                              {selectedItem.details.publisher && <div className="spec-item"><span className="spec-label">Publisher</span> {selectedItem.details.publisher}</div>}
                            </>
                          )}
                          {(selectedItem.type === 'tv' || selectedItem.type === 'anime') && (
                            <>
                              <div className="spec-item"><span className="spec-label">{selectedItem.type === 'tv' ? 'Network' : 'Studio'}</span> {selectedItem.details.network || selectedItem.details.studios?.join(', ')}</div>
                              <div className="spec-item"><span className="spec-label">Air Status</span> {selectedItem.details.status}</div>
                            </>
                          )}
                        </div>
                      )}

                      <div className="local-details">
                        <div className="local-row">
                          <span className="label">Local Path</span>
                          <span className="val">{selectedItem.local?.path || 'No path set'}</span>
                        </div>
                        <div className="local-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <span className="label">Availability</span>
                            <span className={`val ${selectedItem.local?.available ? 'success' : 'fail'}`}>
                              {selectedItem.local?.available ? 'Available Offline' : 'Not Found Manually'}
                            </span>
                          </div>
                          {selectedItem.local?.available ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                axios.post(`${API_BASE}/open`, { filePath: selectedItem.local.path, type: selectedItem.type });
                              }}
                              className="btn btn-primary"
                              style={{ padding: '8px 16px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '100px', boxShadow: '0 0 15px rgba(100, 255, 218, 0.3)' }}
                            >
                              {(selectedItem.type === 'book' || selectedItem.type === 'manga') ? <BookOpen size={16} /> : <Play size={16} fill="currentColor" />}
                              {(selectedItem.type === 'book' || selectedItem.type === 'manga') ? 'Resume Reading' : 'Play Media'}
                            </button>
                          ) : (
                            <button
                               onClick={(e) => {
                                 e.stopPropagation();
                                 setBrowserContext('media');
                                 const pathKey = selectedItem.type === 'movie' ? 'MOVIES_PATH' : (selectedItem.type === 'book' ? 'BOOKS_PATH' : `${selectedItem.type.toUpperCase()}_PATH`);
                                 const defaultPath = settings[pathKey];
                                 fetchBrowserData(defaultPath);
                                 setShowFileBrowser(true);
                               }}
                               className="btn btn-secondary"
                               style={{ padding: '8px 16px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '100px', borderStyle: 'dashed' }}
                            >
                               <Folder size={16} /> Link Local File/Folder
                            </button>
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="form-group">
                      <label className="form-label">Overview</label>
                      <textarea
                        className="form-input"
                        rows="6"
                        value={selectedItem.overview}
                        onChange={(e) => setSelectedItem({ ...selectedItem, overview: e.target.value })}
                      />
                    </div>
                  )}

                  <div style={{ marginTop: 30, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} className="button-group">
                    {!editing ? (
                      <button className="btn btn-primary" onClick={() => setEditing(true)}>
                        <Edit3 size={18} style={{ marginRight: 8, display: 'inline' }} /> Edit Metadata
                      </button>
                    ) : (
                      <>
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <button className="btn btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
                          <button className="btn btn-primary" onClick={async () => {
                            await handleSave(selectedItem);
                            setEditing(false);
                          }}>
                            <Save size={18} style={{ marginRight: 8, display: 'inline' }} /> Save Changes
                          </button>
                        </div>

                        <button
                          className="btn"
                          style={{ backgroundColor: 'rgba(255, 82, 82, 0.1)', color: '#ff5252', border: '1px solid rgba(255, 82, 82, 0.3)' }}
                          onClick={() => handleDelete(selectedItem.id)}
                        >
                          <Trash2 size={18} style={{ marginRight: 8, display: 'inline' }} /> Delete Item
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {editing && (
                <div className="edit-form" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: 40, borderTop: '1px solid var(--glass-border)', paddingTop: 30 }}>
                  <div className="form-group">
                    <label className="form-label">Status</label>
                    <select
                      className="form-input"
                      value={selectedItem.status}
                      onChange={(e) => setSelectedItem({ ...selectedItem, status: e.target.value })}
                    >
                      <option value="planned">Planned</option>
                      <option value="watching">Watching</option>
                      <option value="caught up">Caught Up</option>
                      <option value="completed">Completed</option>
                      <option value="dropped">Dropped</option>
                      <option value="paused">Paused</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Progress (Current)</label>
                    <input type="number" className="form-input" value={selectedItem.progress.current} onChange={(e) => setSelectedItem({ ...selectedItem, progress: { ...selectedItem.progress, current: parseInt(e.target.value) } })} />
                  </div>
                   <div className="form-group">
                    <label className="form-label">Total (Managed by Provider)</label>
                    <input type="number" className="form-input" value={selectedItem.progress.total} disabled style={{ opacity: 0.5, cursor: 'not-allowed' }} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Year (Managed by Provider)</label>
                    <input className="form-input" value={selectedItem.metadata?.year || ''} disabled style={{ opacity: 0.5, cursor: 'not-allowed' }} />
                  </div>
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label className="form-label">Local File Path</label>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <input
                        className={`form-input ${selectedItem.local?.available ? 'valid-path' : ''}`}
                        style={{ flex: 1, borderColor: selectedItem.local?.available ? '#64ffda' : 'inherit' }}
                        value={selectedItem.local?.path || ''}
                        onChange={(e) => {
                          const newPath = e.target.value;
                          setSelectedItem({ 
                            ...selectedItem, 
                            local: { 
                              ...selectedItem.local, 
                              path: newPath,
                              available: newPath.trim() !== "" 
                            } 
                          });
                        }}
                      />
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '0 15px', display: 'flex', alignItems: 'center', gap: '8px' }}
                        onClick={() => {
                          setBrowserContext('media');
                          const pathKey = selectedItem.type === 'movie' ? 'MOVIES_PATH' : (selectedItem.type === 'book' ? 'BOOKS_PATH' : `${selectedItem.type.toUpperCase()}_PATH`);
                          const defaultPath = settings[pathKey];
                          fetchBrowserData(selectedItem.local?.path || defaultPath);
                          setShowFileBrowser(true);
                        }}
                      >
                        <Folder size={16} /> Browse
                      </button>
                    </div>
                    {selectedItem.local?.available && (
                      <div style={{ color: '#64ffda', fontSize: '12px', marginTop: '5px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <CheckCircle size={12} /> Legal path detected
                      </div>
                    )}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Available Locally</label>
                    <select className="form-input" value={selectedItem.local?.available} onChange={(e) => setSelectedItem({ ...selectedItem, local: { ...selectedItem.local, available: e.target.value === 'true' } })}>
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                  </div>
                </div>
              )}

              {seasons.length > 0 && (
                <div className="episodes-section" style={{ marginTop: 40 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                      <h3 className="section-title" style={{ marginBottom: 0 }}>Episodes</h3>
                      <button 
                        className="btn btn-secondary" 
                        style={{ padding: '4px 12px', fontSize: '11px', background: 'rgba(100, 255, 218, 0.1)', color: '#64ffda', border: '1px solid rgba(100, 255, 218, 0.2)' }}
                        onClick={() => {
                          const anyUnwatched = currentEpisodes.some(ep => !selectedItem.userEpisodes?.[`${ep.season || selectedSeason}_${ep.number || ep.mal_id}`]?.watched);
                          handleToggleSeasonWatched(selectedItem.id, currentEpisodes, anyUnwatched);
                        }}
                      >
                        {currentEpisodes.some(ep => !selectedItem.userEpisodes?.[`${ep.season || selectedSeason}_${ep.number || ep.mal_id}`]?.watched) ? "Mark Season Watched" : "Mark Season Unwatched"}
                      </button>
                    </div>
                    <select
                      className="form-input"
                      style={{ width: 'auto' }}
                      value={selectedSeason}
                      onChange={(e) => setSelectedSeason(parseInt(e.target.value))}
                    >
                      {seasons.map(s => (
                        <option key={s} value={s}>Season {s}</option>
                      ))}
                    </select>
                  </div>

                  <div className="episode-grid">
                    {currentEpisodes?.map(ep => (
                      <div key={ep.id || ep.mal_id} className="episode-card">
                        <div className="ep-card-image">
                          <img src={ep.image?.medium || ep.image?.original || getImageUrl(selectedItem)} alt={ep.name || ep.title} />
                          {ep.season ? (
                            <span className="ep-tag">S{ep.season} E{ep.number}</span>
                          ) : (
                            <span className="ep-tag">Ep {ep.mal_id || ep.number}</span>
                          )}
                        </div>
                        <div className="ep-card-body">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <h4 style={{ flex: 1 }}>{ep.name || ep.title || `Episode ${ep.number}`}</h4>
                            {(ep.rating?.average || ep.score) && (
                              <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#FFD700', marginLeft: '8px', whiteSpace: 'nowrap' }}>
                                ⭐ {Number((ep.rating?.average || (ep.score * 2))).toFixed(1)}/10
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span className="ep-date">{ep.airdate || (ep.aired ? ep.aired.split('T')[0] : '')}</span>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              {selectedItem.local?.available && (
                                <button
                                  className="btn-primary"
                                  style={{ padding: '4px 10px', fontSize: '12px', background: 'rgba(235, 131, 23, 0.4)', borderColor: 'rgba(235, 131, 23, 0.5)' }}
                                  onClick={() => axios.post(`${API_BASE}/open-vlc-episode`, {
                                    mediaId: selectedItem.id,
                                    episodeNumber: ep.number || ep.mal_id,
                                    seasonNumber: ep.season || selectedSeason
                                  }).catch(e => alert(e.response?.data?.error || "Episode not found"))}
                                >
                                  <Play size={12} fill="currentColor" style={{ display: 'inline', marginRight: 4 }} /> Play
                                </button>
                              )}
                              
                              <button
                                className="btn-secondary"
                                style={{ padding: '4px 8px', fontSize: '12px', opacity: 0.6 }}
                                onClick={() => handleLinkEpisodePath(selectedItem.id, ep.number || ep.mal_id, ep.season || selectedSeason)}
                                title={selectedItem.userEpisodes?.[`${ep.season || selectedSeason}_${ep.number || ep.mal_id}`]?.path || "Link individual file"}
                              >
                                <LinkIcon size={12} style={{ color: selectedItem.userEpisodes?.[`${ep.season || selectedSeason}_${ep.number || ep.mal_id}`]?.path ? '#64ffda' : 'inherit' }} />
                              </button>

                              <button
                                className={selectedItem.userEpisodes?.[`${ep.season || selectedSeason}_${ep.number || ep.mal_id}`]?.watched ? "btn-primary" : "btn-secondary"}
                                style={{ 
                                  padding: '4px 10px', 
                                  fontSize: '12px',
                                  ...(selectedItem.userEpisodes?.[`${ep.season || selectedSeason}_${ep.number || ep.mal_id}`]?.watched ? { background: '#64ffda', color: '#0a192f' } : {})
                                }}
                                onClick={() => {
                                  const isWatched = selectedItem.userEpisodes?.[`${ep.season || selectedSeason}_${ep.number || ep.mal_id}`]?.watched;
                                  handleToggleEpisodeWatched(selectedItem.id, ep.number || ep.mal_id, ep.season || selectedSeason, !isWatched);
                                  if (!isWatched) handleBulkProgress(selectedItem, ep.number || ep.mal_id);
                                }}
                              >
                                {selectedItem.userEpisodes?.[`${ep.season || selectedSeason}_${ep.number || ep.mal_id}`]?.watched ? "Watched" : "Mark Watched"}
                              </button>
                            </div>
                          </div>
                          <div className="ep-desc" dangerouslySetInnerHTML={{ __html: ep.summary || ep.synopsis || '' }}></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSettings && (
          <div className="modal-overlay" onClick={() => setShowSettings(false)}>
            <motion.div
              className="modal-content"
              style={{ maxWidth: '600px' }}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25 }}>
                <h2 className="section-title" style={{ marginBottom: 0 }}>System Settings</h2>
                <button className="close-btn" onClick={() => setShowSettings(false)}><X size={24} /></button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div className="settings-section">
                  <h3 className="spec-label" style={{ marginBottom: '15px', fontSize: '14px' }}>API Configuration</h3>
                  <div className="form-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label className="form-label">TMDb API Token</label>
                      {settings.TMDB_TOKEN === '••••••••••••••••' && (
                        <button 
                          className="btn-secondary" 
                          style={{ padding: '2px 8px', fontSize: '10px', height: '20px', borderRadius: '4px' }}
                          onClick={() => setSettings({ ...settings, TMDB_TOKEN: '' })}
                        >
                          Reset Token
                        </button>
                      )}
                    </div>
                    <input
                      type="password"
                      className="form-input"
                      placeholder="Enter TMDb Bearer Token..."
                      style={{ opacity: settings.TMDB_TOKEN === '••••••••••••••••' ? 0.6 : 1, cursor: settings.TMDB_TOKEN === '••••••••••••••••' ? 'not-allowed' : 'text' }}
                      value={settings.TMDB_TOKEN || ''}
                      disabled={settings.TMDB_TOKEN === '••••••••••••••••'}
                      onChange={(e) => setSettings({ ...settings, TMDB_TOKEN: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label className="form-label">AniList Token (Optional)</label>
                      {settings.ANILIST_TOKEN === '••••••••••••••••' && (
                        <button 
                          className="btn-secondary" 
                          style={{ padding: '2px 8px', fontSize: '10px', height: '20px', borderRadius: '4px' }}
                          onClick={() => setSettings({ ...settings, ANILIST_TOKEN: '' })}
                        >
                          Reset Token
                        </button>
                      )}
                    </div>
                    <input
                      type="password"
                      className="form-input"
                      placeholder="Enter AniList Token..."
                      style={{ opacity: settings.ANILIST_TOKEN === '••••••••••••••••' ? 0.6 : 1, cursor: settings.ANILIST_TOKEN === '••••••••••••••••' ? 'not-allowed' : 'text' }}
                      value={settings.ANILIST_TOKEN || ''}
                      disabled={settings.ANILIST_TOKEN === '••••••••••••••••'}
                      onChange={(e) => setSettings({ ...settings, ANILIST_TOKEN: e.target.value })}
                    />
                  </div>
                </div>

                <div className="settings-section">
                  <h3 className="spec-label" style={{ marginBottom: '15px', fontSize: '14px' }}>Default Media Locations</h3>
                  {[
                    { label: 'Movies Path', key: 'MOVIES_PATH' },
                    { label: 'TV Shows Path', key: 'TV_PATH' },
                    { label: 'Anime Path', key: 'ANIME_PATH' },
                    { label: 'Manga Path', key: 'MANGA_PATH' },
                    { label: 'Books Path', key: 'BOOKS_PATH' }
                  ].map(field => (
                    <div className="form-group" key={field.key}>
                      <label className="form-label">{field.label}</label>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <input
                          className="form-input"
                          style={{ flex: 1 }}
                          value={settings[field.key] || ''}
                          onChange={(e) => setSettings({ ...settings, [field.key]: e.target.value })}
                          placeholder="/Users/.../Videos"
                        />
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '0 15px' }}
                          onClick={() => {
                            setBrowserContext(field.key);
                            fetchBrowserData(settings[field.key]);
                            setShowFileBrowser(true);
                          }}
                        >
                          <Folder size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="settings-section">
                  <h3 className="spec-label" style={{ marginBottom: '15px', fontSize: '14px' }}>System Preferences</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '15px', borderRadius: '10px' }}>
                      <div>
                        <div style={{ fontWeight: '600', fontSize: '14px' }}>Automatic Meta Refresh</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Sync library data silently on page load</div>
                      </div>
                      <button 
                        className={`island-btn ${settings.AUTO_REFRESH === 'true' ? 'active' : ''}`}
                        style={{ width: '60px', height: '32px', borderRadius: '20px', border: '1px solid var(--glass-border)' }}
                        onClick={() => setSettings({ ...settings, AUTO_REFRESH: settings.AUTO_REFRESH === 'true' ? 'false' : 'true' })}
                      >
                        {settings.AUTO_REFRESH === 'true' ? 'ON' : 'OFF'}
                      </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                      <div className="form-group">
                        <label className="form-label" style={{ fontSize: '11px' }}>Web Search Limit</label>
                        <input
                          type="number"
                          className="form-input"
                          value={settings.SEARCH_LIMIT || '12'}
                          onChange={(e) => setSettings({ ...settings, SEARCH_LIMIT: e.target.value })}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label" style={{ fontSize: '11px' }}>TMDb Region (e.g. US, IN)</label>
                        <input
                          className="form-input"
                          value={settings.TMDB_REGION || 'US'}
                          onChange={(e) => setSettings({ ...settings, TMDB_REGION: e.target.value.toUpperCase() })}
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: '11px' }}>Media Player Command</label>
                      <input
                        className="form-input"
                        value={settings.PLAYER_CMD || 'open -a VLC'}
                        placeholder="e.g. vlc, mpv, open -a IINA"
                        onChange={(e) => setSettings({ ...settings, PLAYER_CMD: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px', marginTop: '20px' }}>
                  <button className="btn btn-secondary" onClick={() => setShowSettings(false)}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleSaveSettings} disabled={isSavingSettings}>
                    {isSavingSettings ? <Loader2 className="loader" size={16} style={{ width: 16, height: 16, borderWidth: 2 }} /> : <Save size={18} style={{ marginRight: 8, display: 'inline' }} />}
                    Save Configuration
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {searchResults.length > 0 && (
          <div className="modal-overlay" onClick={() => setSearchResults([])}>
            <motion.div
              className="modal-content"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25 }}>
                <h2 className="section-title" style={{ marginBottom: 0 }}>Add New Media</h2>
                <button className="close-btn" onClick={() => setSearchResults([])}><X size={24} /></button>
              </div>
              <div className="media-grid">
                {searchResults.map(res => (
                  <div key={res.id} className="media-card" onClick={() => handleWebAdd(res)}>
                    <div className="card-image-container">
                      <img
                        src={res.poster_path || 'https://via.placeholder.com/300x450?text=No+Poster'}
                        className="card-image"
                        alt={res.title}
                      />
                      <div className="play-overlay">
                        <Plus className="play-circle" size={30} />
                      </div>
                      {res.vote_average && (
                        <div style={{ position: 'absolute', bottom: 10, right: 10, zIndex: 11 }}>
                          <span style={{ background: 'rgba(0,0,0,0.8)', color: '#FFD700', padding: '4px 8px', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold' }}>
                            ⭐ {Number(res.vote_average).toFixed(1)}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="card-content">
                      <div className="card-title">{res.title}</div>
                      <div className="card-meta">
                        <span className="type-badge">{res.type}</span>
                        <span>{res.year}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default App;
