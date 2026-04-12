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

  useEffect(() => {
    fetchVideos();
  }, []);

  const fetchVideos = async () => {
    try {
      const response = await api('/videos');
      if (response.ok) {
        const data = await response.json();
        setVideos(data.videos);
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
        await fetchVideos();
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

  if (loading) {
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
                  Refreshing...
                </>
              ) : (
                '🔄 Refresh from Telegram'
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

          {videos.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📹</div>
              <h3>No Videos Yet</h3>
              <p>
                Click "Refresh from Telegram" to fetch videos from your channel.
                Make sure your Telegram integration is configured.
              </p>
              <button className="btn btn-primary" onClick={handleRefresh} disabled={refreshing}>
                {refreshing ? 'Refreshing...' : 'Refresh Now'}
              </button>
            </div>
          ) : (
            <div className="video-grid">
              {videos.map((video, index) => (
                <VideoCard key={video.id} video={video} index={index} />
              ))}
            </div>
          )}
        </div>
      </section>
      <Footer />
    </div>
  );
}
