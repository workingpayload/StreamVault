import { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import VideoCard from '../components/VideoCard';
import Footer from '../components/Footer';

export default function Browse() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const { isSubscribed } = useAuth();
  
  // Pagination & Sorting State
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [sort, setSort] = useState('newest');
  const [totalVideos, setTotalVideos] = useState(0);

  useEffect(() => {
    fetchVideos(page, sort);
  }, [page, sort]);

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

  const handleRefresh = async () => {
    setRefreshing(true);
    setError('');
    try {
      const response = await api('/videos/refresh', { method: 'POST' });
      if (response.ok) {
        setPage(1); // Reset to first page
        await fetchVideos(1, sort);
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to refresh');
      }
    } catch {
      setError('Failed to refresh videos from Telegram');
    } finally {
      setRefreshing(false);
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
              onClick={handleRefresh}
              disabled={refreshing}
            >
              {refreshing ? (
                <>
                  <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }}></span>
                  Syncing...
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
              <div className="empty-state-icon">📹</div>
              <h3>No Videos Yet</h3>
              <p>
                Click "Sync New Videos" to fetch recent videos from your channel.
                Make sure your Telegram integration is configured.
              </p>
              <button className="btn btn-primary" onClick={handleRefresh} disabled={refreshing}>
                {refreshing ? 'Syncing...' : 'Sync Now'}
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
                    ← Previous
                  </button>
                  
                  <span style={{ fontWeight: '500', color: 'var(--color-text-secondary)' }}>
                    Page {page} of {totalPages}
                  </span>
                  
                  {page === totalPages ? (
                    <button 
                      className="btn btn-primary" 
                      disabled={refreshing}
                      onClick={async () => {
                        setRefreshing(true);
                        setError('');
                        try {
                          const response = await api('/videos/refresh-older', { method: 'POST' });
                          if (response.ok) {
                            await fetchVideos(page, sort);
                          } else {
                            const data = await response.json();
                            setError(data.error || 'Failed to fetch older videos');
                          }
                        } catch {
                          setError('Failed to fetch older videos');
                        } finally {
                          setRefreshing(false);
                        }
                      }}
                    >
                      {refreshing ? 'Loading...' : 'Load Older Videos ↓'}
                    </button>
                  ) : (
                    <button 
                      className="btn btn-secondary" 
                      disabled={page === totalPages}
                      onClick={() => setPage(page + 1)}
                    >
                      Next →
                    </button>
                  )}
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
