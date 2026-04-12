import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import Footer from '../components/Footer';

export default function Account() {
  const { user, subscription, isSubscribed, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  if (!user) return null;

  return (
    <div className="page account-page">
      <div className="container">
        <div className="section-header">
          <h1 className="section-title">My Account</h1>
          <p className="section-subtitle">Manage your profile and subscription</p>
        </div>

        <div className="account-grid">
          {/* Profile Card */}
          <div className="account-card animate-fade-in-up delay-1">
            <h2 className="account-card-title">
              👤 Profile
            </h2>
            <div className="account-field">
              <span className="account-field-label">Name</span>
              <span className="account-field-value">{user.name}</span>
            </div>
            <div className="account-field">
              <span className="account-field-label">Email</span>
              <span className="account-field-value">{user.email}</span>
            </div>
            <div className="account-field">
              <span className="account-field-label">Member Since</span>
              <span className="account-field-value">
                {new Date().toLocaleDateString('en-IN', {
                  year: 'numeric',
                  month: 'long',
                })}
              </span>
            </div>
            <button
              className="btn btn-secondary btn-full"
              onClick={handleLogout}
              style={{ marginTop: 'var(--space-4)' }}
            >
              Sign Out
            </button>
          </div>

          {/* Subscription Card */}
          <div className="account-card animate-fade-in-up delay-2">
            <h2 className="account-card-title">
              💎 Subscription
            </h2>

            {isSubscribed && subscription ? (
              <>
                <div className="account-field">
                  <span className="account-field-label">Status</span>
                  <span className="badge badge-success" style={{ width: 'fit-content' }}>
                    Active
                  </span>
                </div>
                <div className="account-field">
                  <span className="account-field-label">Plan</span>
                  <span className="account-field-value">
                    {subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1)}
                  </span>
                </div>
                <div className="account-field">
                  <span className="account-field-label">Started</span>
                  <span className="account-field-value">
                    {new Date(subscription.starts_at).toLocaleDateString('en-IN', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </span>
                </div>
                <div className="account-field">
                  <span className="account-field-label">Expires</span>
                  <span className="account-field-value">
                    {new Date(subscription.expires_at).toLocaleDateString('en-IN', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </span>
                </div>
                <button
                  className="btn btn-primary btn-full"
                  onClick={() => navigate('/pricing')}
                  style={{ marginTop: 'var(--space-4)' }}
                >
                  Extend Subscription
                </button>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: 'var(--space-6) 0' }}>
                <div style={{
                  fontSize: '3rem',
                  marginBottom: 'var(--space-4)',
                }}>
                  🔒
                </div>
                <h3 style={{
                  fontSize: 'var(--font-size-lg)',
                  fontWeight: '600',
                  marginBottom: 'var(--space-2)',
                }}>
                  No Active Subscription
                </h3>
                <p style={{
                  color: 'var(--color-text-secondary)',
                  fontSize: 'var(--font-size-sm)',
                  marginBottom: 'var(--space-6)',
                }}>
                  Subscribe to unlock unlimited video streaming
                </p>
                <button
                  className="btn btn-primary btn-full"
                  onClick={() => navigate('/pricing')}
                >
                  Subscribe Now
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
