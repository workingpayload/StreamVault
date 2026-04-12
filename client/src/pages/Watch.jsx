import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api, getToken, formatDuration, formatFileSize } from '../utils/api';
import { useAuth } from '../context/AuthContext';

export default function Watch() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isSubscribed } = useAuth();
  const videoRef = useRef(null);
  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchVideoInfo();
  }, [id]);

  const fetchVideoInfo = async () => {
    try {
      const response = await api('/videos');
      if (response.ok) {
        const data = await response.json();
        const found = data.videos.find((v) => String(v.id) === String(id));
        if (found) {
          setVideo(found);
        } else {
          setError('Video not found');
        }
      } else {
        setError('Failed to load video info');
      }
    } catch {
      setError('Failed to load video info');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="page loading-page">
        <div className="spinner"></div>
        <p>Loading video...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page loading-page">
        <div className="empty-state-icon">❌</div>
        <h3>{error}</h3>
        <button className="btn btn-primary" onClick={() => navigate('/browse')}>
          Back to Library
        </button>
      </div>
    );
  }

  const streamUrl = `/api/videos/${id}/stream`;
  const token = getToken();

  return (
    <div className="player-page page">
      <div className="player-container">
        <button
          onClick={() => navigate('/browse')}
          className="btn btn-secondary btn-sm"
          style={{ marginBottom: 'var(--space-4)' }}
        >
          ← Back to Library
        </button>

        <div className="player-wrapper">
          {isSubscribed ? (
            <video
              ref={videoRef}
              controls
              autoPlay
              preload="auto"
              src={`${streamUrl}?token=${encodeURIComponent(token)}`}
              style={{ width: '100%', height: '100%' }}
            >
              Your browser does not support video playback.
            </video>
          ) : (
            <div className="player-overlay">
              <div className="player-overlay-icon">
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z" />
                </svg>
              </div>
              <h3>Subscribe to Watch</h3>
              <p>
                Unlock unlimited access to all videos with a subscription plan starting at just ₹99/week.
              </p>
              <Link to="/pricing" className="btn btn-primary btn-lg">
                View Plans →
              </Link>
            </div>
          )}
        </div>

        <div className="player-info">
          <h1 className="player-title">{video.title}</h1>
          <div style={{
            display: 'flex',
            gap: 'var(--space-4)',
            marginBottom: 'var(--space-4)',
            flexWrap: 'wrap',
          }}>
            {video.duration && (
              <span className="badge badge-accent">
                {formatDuration(video.duration)}
              </span>
            )}
            {video.file_size && (
              <span className="badge badge-accent">
                {formatFileSize(video.file_size)}
              </span>
            )}
            {video.width && video.height && (
              <span className="badge badge-success">
                {video.width}×{video.height}
              </span>
            )}
          </div>
          {video.description && (
            <p className="player-description">{video.description}</p>
          )}
        </div>
      </div>
    </div>
  );
}
