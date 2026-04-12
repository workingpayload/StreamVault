import { useNavigate } from 'react-router-dom';
import { formatDuration, formatFileSize } from '../utils/api';

export default function VideoCard({ video, index }) {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(`/watch/${video.id}`);
  };

  return (
    <div
      className={`video-card animate-fade-in-up delay-${Math.min(index % 5 + 1, 5)}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
    >
      <div className="video-card-thumb">
        {video.thumbnail ? (
          <img
            src={video.thumbnail}
            alt={video.title}
            loading="lazy"
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              background: `linear-gradient(135deg, hsl(${(video.id * 37) % 360}, 60%, 20%), hsl(${(video.id * 73) % 360}, 50%, 15%))`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '2rem',
            }}
          >
            🎬
          </div>
        )}
        <div className="video-card-play">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
        {video.duration && (
          <div className="video-card-duration">
            {formatDuration(video.duration)}
          </div>
        )}
      </div>
      <div className="video-card-info">
        <h3 className="video-card-title">{video.title}</h3>
        <div className="video-card-meta">
          {video.file_size && <span>{formatFileSize(video.file_size)}</span>}
          {video.width && video.height && (
            <span>{video.height >= 1080 ? 'HD' : video.height >= 720 ? '720p' : 'SD'}</span>
          )}
        </div>
      </div>
    </div>
  );
}
