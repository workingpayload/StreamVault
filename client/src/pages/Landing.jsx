import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Footer from '../components/Footer';

export default function Landing() {
  const { user } = useAuth();

  return (
    <div className="page">
      {/* Hero Section */}
      <section className="hero">
        <div className="hero-content">
          <div className="hero-badge">
            ✨ Premium Exclusive Content
          </div>
          <h1 className="hero-title">
            Stream <span>Exclusive</span> Videos,{' '}
            <span>Anytime</span>
          </h1>
          <p className="hero-description">
            Unlock a curated library of premium content. Subscribe once and enjoy
            unlimited streaming in stunning quality on any device.
          </p>
          <div className="hero-buttons">
            {user ? (
              <>
                <Link to="/browse" className="btn btn-primary btn-lg">
                  Browse Library
                </Link>
                <Link to="/pricing" className="btn btn-secondary btn-lg">
                  View Plans
                </Link>
              </>
            ) : (
              <>
                <Link to="/register" className="btn btn-primary btn-lg">
                  Start Streaming →
                </Link>
                <Link to="/login" className="btn btn-secondary btn-lg">
                  Sign In
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="page-section" style={{ background: 'var(--color-bg-secondary)' }}>
        <div className="container">
          <div className="section-header" style={{ textAlign: 'center' }}>
            <h2 className="section-title">Why StreamVault?</h2>
            <p className="section-subtitle" style={{ margin: '0 auto' }}>
              Everything you need for a premium streaming experience
            </p>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: 'var(--space-6)',
            maxWidth: '1000px',
            margin: '0 auto',
          }}>
            <FeatureCard
              icon="🎬"
              title="Exclusive Content"
              description="Access premium videos curated for our subscribers only"
              delay="1"
            />
            <FeatureCard
              icon="⚡"
              title="Instant Streaming"
              description="No downloads. Stream instantly in high quality"
              delay="2"
            />
            <FeatureCard
              icon="🔒"
              title="Secure & Private"
              description="Your data is protected with end-to-end encryption"
              delay="3"
            />
            <FeatureCard
              icon="📱"
              title="Any Device"
              description="Watch on desktop, tablet, or mobile — anywhere"
              delay="4"
            />
            <FeatureCard
              icon="💎"
              title="Affordable Plans"
              description="Choose weekly, monthly, or yearly — cancel anytime"
              delay="5"
            />
            <FeatureCard
              icon="🚀"
              title="New Content Weekly"
              description="Fresh videos added regularly to keep you engaged"
              delay="1"
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="page-section">
        <div className="container" style={{ textAlign: 'center' }}>
          <h2 style={{
            fontSize: 'var(--font-size-3xl)',
            fontWeight: '800',
            marginBottom: 'var(--space-4)',
            letterSpacing: '-0.03em',
          }}>
            Ready to start streaming?
          </h2>
          <p style={{
            fontSize: 'var(--font-size-lg)',
            color: 'var(--color-text-secondary)',
            marginBottom: 'var(--space-8)',
            maxWidth: '500px',
            margin: '0 auto var(--space-8)',
          }}>
            Join StreamVault today and unlock unlimited access to our entire content library.
          </p>
          <Link
            to={user ? '/browse' : '/register'}
            className="btn btn-primary btn-lg"
          >
            {user ? 'Browse Library' : 'Create Free Account →'}
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function FeatureCard({ icon, title, description, delay }) {
  return (
    <div className={`card animate-fade-in-up delay-${delay}`} style={{ textAlign: 'center' }}>
      <div style={{
        fontSize: '2.5rem',
        marginBottom: 'var(--space-4)',
      }}>
        {icon}
      </div>
      <h3 style={{
        fontSize: 'var(--font-size-lg)',
        fontWeight: '700',
        marginBottom: 'var(--space-2)',
      }}>
        {title}
      </h3>
      <p style={{
        fontSize: 'var(--font-size-sm)',
        color: 'var(--color-text-secondary)',
        lineHeight: '1.6',
      }}>
        {description}
      </p>
    </div>
  );
}
