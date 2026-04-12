import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, isSubscribed, isAdmin, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path) => location.pathname === path ? 'navbar-link active' : 'navbar-link';

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="navbar-logo">
          <div className="navbar-logo-icon">▶</div>
          StreamVault
        </Link>

        <div className="navbar-links">
          {user ? (
            <>
              <Link to="/browse" className={isActive('/browse')}>
                Browse
              </Link>
              <Link to="/pricing" className={isActive('/pricing')}>
                {isSubscribed ? 'Plans' : '✨ Subscribe'}
              </Link>
              <Link to="/account" className={isActive('/account')}>
                Account
              </Link>
              {isAdmin && (
                <Link to="/admin" className={isActive('/admin')} style={{ color: 'var(--color-accent)' }}>
                  ⚙ Admin
                </Link>
              )}
              <button onClick={handleLogout} className="navbar-link">
                Logout
              </button>
              <div className="navbar-avatar" title={user.name}>
                {user.name.charAt(0).toUpperCase()}
              </div>
            </>
          ) : (
            <>
              <Link to="/pricing" className={isActive('/pricing')}>
                Pricing
              </Link>
              <Link to="/login" className={isActive('/login')}>
                Login
              </Link>
              <Link to="/register" className="btn btn-primary btn-sm">
                Get Started
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
