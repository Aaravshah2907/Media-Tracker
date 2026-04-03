import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Search, Loader2, Edit3, X, Save, ExternalLink, RefreshCw, Send, ZapOff, CheckCircle, Folder, Play, Download, PlusCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = 'http://localhost:3001/api';

const App = () => {
  const [library, setLibrary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [editing, setEditing] = useState(false);
  const [selectedCache, setSelectedCache] = useState(null);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [showLocalOnly, setShowLocalOnly] = useState(false);
  const [syncing, setSyncing] = useState(false);
  
  
  // INITIAL LOAD: Run mt-info silently
  useEffect(() => {
    runSync();
    fetchLibrary();
  }, []);


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

  const fetchCacheOnSelect = async (item) => {
    if (!item) return;
    try {
        const res = await axios.get(`${API_BASE}/cache/${item.type}/${item.id}`);
        setSelectedCache(res.data);
    } catch (e) {
        setSelectedCache(null);
    }
  };

  useEffect(() => {
    if (selectedItem) {
        fetchCacheOnSelect(selectedItem);
        setSelectedSeason(1);
    } else {
        setSelectedCache(null);
    }
  }, [selectedItem]);

  const fetchLibrary = async () => {
    try {
      const res = await axios.get(`${API_BASE}/library`);
      const mediaItems = res.data.media || [];
      setLibrary(mediaItems);
      setLoading(false);
      
      // Gradually enhance
      mediaItems.forEach(async (item, index) => {
          if (!item.poster_path) {
              try {
                  const cacheRes = await axios.get(`${API_BASE}/cache/${item.type}/${item.id}`);
                  const data = cacheRes.data;
                  let poster = null;
                  
                  if (item.type === 'anime' || item.type === 'manga') {
                      poster = data.data?.Media?.coverImage?.extraLarge || data.data?.Media?.coverImage?.large;
                  } else if (item.type === 'tv') {
                      poster = data.image?.original || data.image?.medium;
                  } else if (item.type === 'book') {
                      if (data.covers && data.covers.length > 0 && data.covers[0] !== -1) {
                          poster = `https://covers.openlibrary.org/b/id/${data.covers[0]}-L.jpg`;
                      }
                  }

                  if (poster) {
                      setLibrary(prev => {
                          const nextIdx = prev.findIndex(it => it.id === item.id);
                          if (nextIdx === -1) return prev;
                          const next = [...prev];
                          next[nextIdx] = { ...next[nextIdx], poster_path: poster };
                          return next;
                      });
                  }
              } catch (e) {
                  // silent
              }
          }
      });
    } catch (err) {
      console.error('Failed to fetch library', err);
      setLoading(false);
    }
  };

  const closeModal = () => {
    setSelectedItem(null);
    setEditing(false);
    runSync(); // Silent Refresh on close
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
    return matchesSearch && matchesLocal;
  });

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
    if (!selectedItem || !selectedCache || selectedItem.type !== 'tv') return [];
    const episodes = selectedCache._embedded?.episodes || [];
    const seasons = [...new Set(episodes.map(ep => ep.season))];
    return seasons;
  };

  const getEpisodesBySeason = (season) => {
    if (!selectedItem || !selectedCache || selectedItem.type !== 'tv') return null;
    return selectedCache._embedded?.episodes?.filter(ep => ep.season === season);
  };

  const seasons = getSeasons();
  const currentEpisodes = getEpisodesBySeason(selectedSeason);

  return (
    <div className="app-container">
      <header>
        <motion.h1 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          TRACKER VIEW
        </motion.h1>
        
        <div className="header-controls">
          <div className="search-wrapper">
            <Search className="search-icon" size={18} />
            <input 
              type="text" 
              className="search-bar" 
              placeholder="Search library..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <button 
             className="icon-btn" 
             style={showLocalOnly ? { background: 'var(--accent-color)', color: 'var(--bg-color)', borderColor: 'var(--accent-color)' } : {}}
             onClick={() => setShowLocalOnly(!showLocalOnly)} 
             title={showLocalOnly ? "Showing Custom Local Media" : "Filter Local Only"}
          >
            <Download size={20} />
          </button>

          <button className="icon-btn" onClick={() => axios.post(`${API_BASE}/open-mt-add`)} title="Add Media">
            <PlusCircle size={20} />
          </button>

          <button 
            className={`icon-btn ${syncing ? 'spinning' : ''}`} 
            onClick={() => runSync()} 
            title={syncing ? "Syncing..." : "Refresh Metadata"}
            disabled={syncing}
          >
            {syncing ? <Loader2 size={20} className="loader" /> : <RefreshCw size={20} />}
          </button>
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
                        className="media-card"
                        onClick={() => setSelectedItem(item)}
                      >
                        <div className="card-image-container">
                          <img src={getImageUrl(item)} alt={item.title} className="card-image" loading="lazy" />
                          <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 11 }}>
                            <span className="type-badge">{item.status}</span>
                          </div>
                          {item.local?.available && (
                             <div className="play-overlay">
                                 <button 
                                     className="play-circle"
                                     onClick={(e) => {
                                         e.stopPropagation();
                                         axios.post(`${API_BASE}/open-vlc`, { filePath: item.local.path });
                                     }}
                                     title="Play in VLC"
                                 >
                                     <Play fill="currentColor" size={24} style={{ marginLeft: '4px' }} />
                                 </button>
                             </div>
                          )}
                        </div>
                        <div className="card-content">
                          <h3 className="card-title">{item.title}</h3>
                          <div className="card-meta">
                            <span>{item.metadata?.year || 'N/A'}</span>
                            <span>•</span>
                            <span>{item.progress.current} / {item.progress.total || '?'} {item.progress.unit}</span>
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
                <img src={getImageUrl(selectedItem)} alt={selectedItem.title} className="modal-poster" />
                <div className="modal-info">
                  <h2 className="modal-title">{selectedItem.title}</h2>
                  <div className="card-meta" style={{ marginBottom: 20 }}>
                    <span className="type-badge">{selectedItem.type}</span>
                    <span>{selectedItem.metadata?.year}</span>
                    <span>{selectedItem.status}</span>
                  </div>
                  {!editing ? (
                    <>
                        <div className="modal-overview" dangerouslySetInnerHTML={{ __html: selectedItem.overview }}></div>
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
                                {selectedItem.local?.available && (
                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            axios.post(`${API_BASE}/open-vlc`, { filePath: selectedItem.local.path });
                                        }}
                                        className="btn btn-primary"
                                        style={{ padding: '8px 16px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '100px', boxShadow: '0 0 15px rgba(100, 255, 218, 0.3)' }}
                                    >
                                        <Play size={16} fill="currentColor" /> Play via VLC
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
                        onChange={(e) => setSelectedItem({...selectedItem, overview: e.target.value})}
                      />
                    </div>
                  )}
                  
                  <div style={{ marginTop: 30 }} className="button-group">
                    {!editing ? (
                      <button className="btn btn-primary" onClick={() => setEditing(true)}>
                        <Edit3 size={18} style={{ marginRight: 8, display: 'inline' }} /> Edit Metadata
                      </button>
                    ) : (
                      <>
                        <button className="btn btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
                        <button className="btn btn-primary" onClick={async () => {
                            await handleSave(selectedItem);
                            setEditing(false);
                        }}>
                          <Save size={18} style={{ marginRight: 8, display: 'inline' }} /> Save Changes
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
                    <input className="form-input" value={selectedItem.status} onChange={(e) => setSelectedItem({...selectedItem, status: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Progress (Current)</label>
                    <input type="number" className="form-input" value={selectedItem.progress.current} onChange={(e) => setSelectedItem({...selectedItem, progress: {...selectedItem.progress, current: parseInt(e.target.value)}})} />
                  </div>
                   <div className="form-group">
                    <label className="form-label">Total</label>
                    <input type="number" className="form-input" value={selectedItem.progress.total} onChange={(e) => setSelectedItem({...selectedItem, progress: {...selectedItem.progress, total: parseInt(e.target.value)}})} />
                  </div>
                   <div className="form-group">
                    <label className="form-label">Year</label>
                    <input className="form-input" value={selectedItem.metadata?.year || ''} onChange={(e) => setSelectedItem({...selectedItem, metadata: {...selectedItem.metadata, year: e.target.value}})} />
                  </div>
                   <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label className="form-label">Local File Path</label>
                    <input className="form-input" value={selectedItem.local?.path || ''} onChange={(e) => setSelectedItem({...selectedItem, local: {...selectedItem.local, path: e.target.value}})} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Available Locally</label>
                    <select className="form-input" value={selectedItem.local?.available} onChange={(e) => setSelectedItem({...selectedItem, local: {...selectedItem.local, available: e.target.value === 'true'}})}>
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                    </select>
                  </div>
                </div>
              )}

              {seasons.length > 0 && (
                <div className="episodes-section" style={{ marginTop: 40 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <h3 className="section-title" style={{ marginBottom: 0 }}>Episodes</h3>
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
                      <div key={ep.id} className="episode-card">
                        <div className="ep-card-image">
                           <img src={ep.image?.medium || ep.image?.original} alt={ep.name} />
                           <span className="ep-tag">S{ep.season} E{ep.number}</span>
                        </div>
                        <div className="ep-card-body">
                          <h4>{ep.name}</h4>
                          <span className="ep-date">{ep.airdate}</span>
                          <div className="ep-desc" dangerouslySetInnerHTML={{ __html: ep.summary }}></div>
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
    </div>
  );
};

export default App;
