import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import VideoCard from '../components/VideoCard';
import Footer from '../components/Footer';

export default function Browse() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [error, setError] = useState('');
  const { isSubscribed } = useAuth();
  
  // Pagination & Sorting State
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [sort, setSort] = useState('newest');
  const [totalVideos, setTotalVideos] = useState(0);

  const pollRef = useRef(null);

  useEffect(() => {
    fetchVideos(page, sort);
  }, [page, sort]);

  // On mount, check if a sync is already running (e.g. startup sync)
  useEffect(() => {
    (async () => {
      try {
        const res = await api('/videos/sync-status');
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'running') {
            setSyncing(true);
            setSyncMessage('Startup sync in progress...');
            startPolling(() => {
              fetchVideos(page, sort);
            });
          }
        }
      } catch { /* ignore */ }
    })();
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const fetchVideos = async (currentPage, currentSort) => {
    setLoading(true);
    try {
      const response = await api(`/videos?page=${currentPage}&limit=24&sort=${currentSort}`);
      if (response.ok) {
        const data = await response.json();
        setVideos(data.videos);
        if (data.pagination) {
          setTotalPages(data.pagination.totalPages);
          setTotalVideos(data.pagination.total);
        }
      } else {
        setError('Failed to load videos');
      }
    } catch {
      setError('Failed to load videos');
    } finally {
      setLoading(false);
    }
  };

  // Poll /sync-status until the background job finishes
  const startPolling = useCallback((onDone) => {
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      try {
        const res = await api('/videos/sync-status');
        if (!res.ok) return;
        const data = await res.json();

        if (data.status === 'running') {
          const foundMsg = data.found ? ` \u2022 ${data.found} videos found` : '';
          setSyncMessage(`Syncing... (${data.elapsed || 0}s${foundMsg})`);
        } else if (data.status === 'done') {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setSyncing(false);
          setSyncMessage('');
          if (onDone) onDone(data);
        } else if (data.status === 'error') {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setSyncing(false);
          setSyncMessage('');
          setError(data.error || 'Sync failed');
        } else {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setSyncing(false);
          setSyncMessage('');
        }
      } catch {
        // Network error during poll — keep trying
      }
    }, 2000);
  }, []);

  const handleSyncNew = async () => {
    setSyncing(true);
    setError('');
    setSyncMessage('Starting sync...');
    try {
      const response = await api('/videos/refresh', { method: 'POST' });
      const data = await response.json();

      if (data.status === 'started' || data.status === 'running') {
        startPolling(() => {
          setPage(1);
          fetchVideos(1, sort);
        });
      } else {
        setSyncing(false);
        setSyncMessage('');
        setError(data.error || 'Unknown sync error');
      }
    } catch {
      setSyncing(false);
      setSyncMessage('');
      setError('Failed to start sync');
    }
  };

  const handleLoadOlder = async () => {
    setSyncing(true);
    setError('');
    setSyncMessage('Loading older videos...');
    try {
      const response = await api('/videos/refresh-older', { method: 'POST' });
      const data = await response.json();

      if (data.status === 'started' || data.status === 'running') {
        startPolling(() => {
          fetchVideos(page, sort);
        });
      } else if (data.error) {
        setSyncing(false);
        setSyncMessage('');
        setError(data.error);
      } else {
        setSyncing(false);
        setSyncMessage('');
      }
    } catch {
      setSyncing(false);
      setSyncMessage('');
      setError('Failed to load older videos');
    }
  };

  if (loading && videos.length === 0) {
    return (
      <div className="page loading-page">
        <div className="spinner"></div>
        <p>Loading videos...</p>
      </div>
    );
  }

  return (
    <div className="page">
      <section className="page-section">
        <div className="container">
          <div className="section-header" style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 'var(--space-4)',
          }}>
            <div>
              <h1 className="section-title">Video Library</h1>
              <p className="section-subtitle">
                {isSubscribed
                  ? 'Enjoy unlimited streaming of all content'
                  : 'Subscribe to start watching'}
              </p>
            </div>
            <button
              className="btn btn-secondary"
              onClick={handleSyncNew}
              disabled={syncing}
            >
              {syncing ? (
                <>
                  <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }}></span>
                  {syncMessage || 'Syncing...'}
                </>
              ) : (
                '🔄 Sync New Videos'
              )}
            </button>
          </div>

          {error && (
            <div className="auth-error" style={{ marginBottom: 'var(--space-6)' }}>
              {error}
            </div>
          )}

          {/* Live sync banner */}
          {syncing && (
            <div className="card" style={{
              marginBottom: 'var(--space-6)',
              background: 'rgba(59, 130, 246, 0.08)',
              borderColor: 'rgba(59, 130, 246, 0.3)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
            }}>
              <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }}></span>
              <span style={{ color: 'var(--color-text-secondary)' }}>
                {syncMessage || 'Syncing with Telegram...'}
              </span>
            </div>
          )}

          {!isSubscribed && (
            <div className="card" style={{
              marginBottom: 'var(--space-8)',
              background: 'rgba(139, 92, 246, 0.08)',
              borderColor: 'rgba(139, 92, 246, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 'var(--space-4)',
            }}>
              <div>
                <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: '700', marginBottom: 'var(--space-1)' }}>
                  🔒 Subscription Required
                </h3>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                  You can browse the catalog, but a subscription is needed to watch videos.
                </p>
              </div>
              <a href="/pricing" className="btn btn-primary">
                Subscribe Now
              </a>
            </div>
          )}

          {videos.length === 0 && !loading ? (
            <div className="empty-state">
              <div className="empty-state-icon">{'\ud83d\udcf9'}</div>
              <h3>No Videos Yet</h3>
              <p>
                Click &quot;Sync New Videos&quot; to fetch recent videos from your channel.
                Make sure your Telegram integration is configured.
              </p>
              <button className="btn btn-primary" onClick={handleSyncNew} disabled={syncing}>
                {syncing ? 'Syncing...' : 'Sync Now'}
              </button>
            </div>
          ) : (
            <>
              {/* Controls (Sort) */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
                <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                  Showing {videos.length} videos (Total: {totalVideos})
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  <label style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>Sort by:</label>
                  <select 
                    className="input" 
                    style={{ padding: 'var(--space-2) var(--space-4)', width: 'auto' }}
                    value={sort}
                    onChange={(e) => { setSort(e.target.value); setPage(1); }}
                  >
                    <option value="newest">Newest First</option>
                    <option value="oldest">Oldest First</option>
                    <option value="size_desc">Largest Size</option>
                    <option value="size_asc">Smallest Size</option>
                    <option value="duration_desc">Longest Duration</option>
                  </select>
                </div>
              </div>

              <div className="video-grid">
                {videos.map((video, index) => (
                  <VideoCard key={video.id} video={video} index={index} />
                ))}
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'center', 
                  alignItems: 'center', 
                  gap: 'var(--space-4)', 
                  marginTop: 'var(--space-10)',
                  flexWrap: 'wrap' 
                }}>
                  <button 
                    className="btn btn-secondary" 
                    disabled={page === 1}
                    onClick={() => setPage(page - 1)}
                  >
                    {'\u2190'} Previous
                  </button>
                  
                  <span style={{ fontWeight: '500', color: 'var(--color-text-secondary)' }}>
                    Page {page} of {totalPages}
                  </span>
                  
                  {page === totalPages ? (
                    <button 
                      className="btn btn-primary" 
                      disabled={syncing}
                      onClick={handleLoadOlder}
                    >
                      {syncing ? 'Loading...' : <>Load Older Videos {'\u2193'}</>}
                    </button>
                  ) : (
                    <button 
                      className="btn btn-secondary" 
                      onClick={() => setPage(page + 1)}
                    >
                      Next {'\u2192'}
                    </button>
                  )}
                </div>
              )}

              {/* Single page — still show Load Older */}
              {totalPages <= 1 && videos.length > 0 && (
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'center', 
                  marginTop: 'var(--space-10)' 
                }}>
                  <button 
                    className="btn btn-primary" 
                    disabled={syncing}
                    onClick={handleLoadOlder}
                  >
                    {syncing ? 'Loading...' : <>Load Older Videos {'\u2193'}</>}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>
      <Footer />
    </div>
  );
}
