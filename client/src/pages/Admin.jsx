import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, formatPrice, formatFileSize, formatDuration } from '../utils/api';
import { useAuth } from '../context/AuthContext';

export default function Admin() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [dashboard, setDashboard] = useState(null);
  const [users, setUsers] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [videos, setVideos] = useState([]);
  const [videoPage, setVideoPage] = useState(1);
  const [videoTotalPages, setVideoTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [grantModal, setGrantModal] = useState(null); // { userId, userName }
  const [grantPlan, setGrantPlan] = useState('monthly');
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!isAdmin) {
      navigate('/');
      return;
    }
    loadDashboard();
  }, [isAdmin]);

  useEffect(() => {
    if (activeTab === 'users') loadUsers();
    if (activeTab === 'subscriptions') loadSubscriptions();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'videos') loadVideos(videoPage);
  }, [activeTab, videoPage]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadDashboard = async () => {
    try {
      const res = await api('/admin/dashboard');
      if (res.ok) {
        setDashboard(await res.json());
      } else {
        setError('Failed to load dashboard');
      }
    } catch {
      setError('Failed to load dashboard');
    }
    setLoading(false);
  };

  const loadUsers = async () => {
    const res = await api('/admin/users');
    if (res.ok) setUsers((await res.json()).users);
  };

  const loadSubscriptions = async () => {
    const res = await api('/admin/subscriptions');
    if (res.ok) setSubscriptions((await res.json()).subscriptions);
  };

  const loadVideos = async (page) => {
    const res = await api(`/admin/videos?page=${page}&limit=50`);
    if (res.ok) {
      const data = await res.json();
      setVideos(data.videos);
      if (data.pagination) {
        setVideoTotalPages(data.pagination.totalPages);
      }
    }
  };

  const handleDeleteVideo = async (id) => {
    if (!confirm('Remove this video from cache?')) return;
    const res = await api(`/admin/videos/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setVideos(videos.filter(v => v.id !== id));
      showToast('Video removed from cache');
    }
  };

  const handleGrantSubscription = async () => {
    if (!grantModal) return;
    const res = await api(`/admin/users/${grantModal.userId}/grant`, {
      method: 'POST',
      body: JSON.stringify({ plan: grantPlan }),
    });
    if (res.ok) {
      const data = await res.json();
      showToast(`Subscription granted to ${grantModal.userName}. Expires: ${new Date(data.expiresAt).toLocaleDateString()}`);
      setGrantModal(null);
      loadUsers();
      loadDashboard();
    } else {
      showToast('Failed to grant subscription', 'error');
    }
  };

  const handleRefreshVideos = async () => {
    showToast('Refreshing videos from Telegram...');
    const res = await api('/videos/refresh', { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      showToast(data.message);
      setVideoPage(1);
      loadVideos(1);
      loadDashboard();
    } else {
      showToast('Failed to refresh videos', 'error');
    }
  };

  if (loading) {
    return (
      <div className="page loading-page">
        <div className="spinner"></div>
        <p>Loading admin dashboard...</p>
      </div>
    );
  }

  const tabs = [
    { key: 'dashboard', label: '📊 Dashboard' },
    { key: 'users', label: '👤 Users' },
    { key: 'subscriptions', label: '💳 Subscriptions' },
    { key: 'videos', label: '🎬 Videos' },
  ];

  return (
    <div className="page" style={{ paddingTop: 'calc(var(--header-height) + var(--space-8))' }}>
      <div className="container">
        <div className="section-header">
          <h1 className="section-title">Admin Panel</h1>
          <p className="section-subtitle">Manage users, subscriptions, and content</p>
        </div>

        {/* Tab Navigation */}
        <div style={{
          display: 'flex',
          gap: 'var(--space-2)',
          marginBottom: 'var(--space-8)',
          borderBottom: '1px solid var(--color-border)',
          paddingBottom: 'var(--space-2)',
          overflowX: 'auto',
        }}>
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`btn ${activeTab === tab.key ? 'btn-primary' : 'btn-secondary'}`}
              style={{ borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)' }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {error && <div className="auth-error" style={{ marginBottom: 'var(--space-6)' }}>{error}</div>}

        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && dashboard && (
          <div className="animate-fade-in">
            {/* Stats Cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 'var(--space-5)',
              marginBottom: 'var(--space-10)',
            }}>
              <StatCard icon="👤" label="Total Users" value={dashboard.stats.totalUsers} />
              <StatCard icon="✅" label="Active Subs" value={dashboard.stats.activeSubscriptions} />
              <StatCard icon="🎬" label="Videos" value={dashboard.stats.totalVideos} />
              <StatCard icon="💰" label="Total Revenue" value={formatPrice(dashboard.stats.totalRevenue)} />
            </div>

            {/* Plan Breakdown */}
            {dashboard.planBreakdown.length > 0 && (
              <div style={{ marginBottom: 'var(--space-10)' }}>
                <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: '700', marginBottom: 'var(--space-4)' }}>
                  Active Subscriptions by Plan
                </h3>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: 'var(--space-4)',
                }}>
                  {dashboard.planBreakdown.map(p => (
                    <div key={p.plan} className="card" style={{ textAlign: 'center', padding: 'var(--space-5)' }}>
                      <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: '800' }}>{p.count}</div>
                      <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', textTransform: 'capitalize' }}>{p.plan}</div>
                      <div style={{ color: 'var(--color-accent)', fontSize: 'var(--font-size-sm)', marginTop: 'var(--space-2)' }}>{formatPrice(p.revenue)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Subscriptions */}
            {dashboard.recentSubscriptions.length > 0 && (
              <div>
                <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: '700', marginBottom: 'var(--space-4)' }}>
                  Recent Subscriptions
                </h3>
                <TableWrapper>
                  <table>
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Plan</th>
                        <th>Status</th>
                        <th>Amount</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard.recentSubscriptions.map(s => (
                        <tr key={s.id}>
                          <td>
                            <div style={{ fontWeight: '600' }}>{s.user_name}</div>
                            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>{s.user_email}</div>
                          </td>
                          <td style={{ textTransform: 'capitalize' }}>{s.plan}</td>
                          <td><StatusBadge status={s.status} /></td>
                          <td>{formatPrice(s.amount)}</td>
                          <td style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                            {new Date(s.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrapper>
              </div>
            )}
          </div>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && (
          <div className="animate-fade-in">
            <TableWrapper>
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Plan</th>
                    <th>Expires</th>
                    <th>Joined</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id}>
                      <td style={{ color: 'var(--color-text-muted)' }}>#{u.id}</td>
                      <td style={{ fontWeight: '600' }}>{u.name}</td>
                      <td>{u.email}</td>
                      <td>
                        {u.active_plan ? (
                          <span className="badge badge-success" style={{ textTransform: 'capitalize' }}>{u.active_plan}</span>
                        ) : (
                          <span className="badge badge-warning">None</span>
                        )}
                      </td>
                      <td style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                        {u.sub_expires_at ? new Date(u.sub_expires_at).toLocaleDateString() : '—'}
                      </td>
                      <td style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => setGrantModal({ userId: u.id, userName: u.name })}
                        >
                          Grant Sub
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrapper>
            {users.length === 0 && (
              <div className="empty-state">
                <div className="empty-state-icon">👤</div>
                <h3>No Users Yet</h3>
                <p>Users will appear here after they register.</p>
              </div>
            )}
          </div>
        )}

        {/* Subscriptions Tab */}
        {activeTab === 'subscriptions' && (
          <div className="animate-fade-in">
            <TableWrapper>
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>User</th>
                    <th>Plan</th>
                    <th>Status</th>
                    <th>Amount</th>
                    <th>Starts</th>
                    <th>Expires</th>
                    <th>Razorpay Order</th>
                  </tr>
                </thead>
                <tbody>
                  {subscriptions.map(s => (
                    <tr key={s.id}>
                      <td style={{ color: 'var(--color-text-muted)' }}>#{s.id}</td>
                      <td>
                        <div style={{ fontWeight: '600' }}>{s.user_name}</div>
                        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>{s.user_email}</div>
                      </td>
                      <td style={{ textTransform: 'capitalize' }}>{s.plan}</td>
                      <td><StatusBadge status={s.status} /></td>
                      <td>{formatPrice(s.amount)}</td>
                      <td style={{ fontSize: 'var(--font-size-sm)' }}>
                        {s.starts_at ? new Date(s.starts_at).toLocaleDateString() : '—'}
                      </td>
                      <td style={{ fontSize: 'var(--font-size-sm)' }}>
                        {s.expires_at ? new Date(s.expires_at).toLocaleDateString() : '—'}
                      </td>
                      <td style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {s.razorpay_order_id || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrapper>
            {subscriptions.length === 0 && (
              <div className="empty-state">
                <div className="empty-state-icon">💳</div>
                <h3>No Subscriptions Yet</h3>
                <p>Subscription history will appear here.</p>
              </div>
            )}
          </div>
        )}

        {/* Videos Tab */}
        {activeTab === 'videos' && (
          <div className="animate-fade-in">
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-4)' }}>
              <button className="btn btn-primary" onClick={handleRefreshVideos}>
                🔄 Refresh from Telegram
              </button>
            </div>
            <TableWrapper>
              <table>
                <thead>
                  <tr>
                    <th>Msg ID</th>
                    <th>Title</th>
                    <th>Duration</th>
                    <th>Size</th>
                    <th>Resolution</th>
                    <th>Cached</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {videos.map(v => (
                    <tr key={v.id}>
                      <td style={{ color: 'var(--color-text-muted)' }}>#{v.id}</td>
                      <td style={{ fontWeight: '600', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {v.title}
                      </td>
                      <td>{v.duration ? formatDuration(v.duration) : '—'}</td>
                      <td>{v.file_size ? formatFileSize(v.file_size) : '—'}</td>
                      <td>{v.width && v.height ? `${v.width}×${v.height}` : '—'}</td>
                      <td style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                        {new Date(v.cached_at).toLocaleDateString()}
                      </td>
                      <td>
                        <button
                          className="btn btn-sm"
                          onClick={() => handleDeleteVideo(v.id)}
                          style={{ color: 'var(--color-error)' }}
                        >
                          🗑 Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrapper>
            {videos.length === 0 && (
              <div className="empty-state">
                <div className="empty-state-icon">🎬</div>
                <h3>No Videos Cached</h3>
                <p>Click "Refresh from Telegram" to fetch videos from your channel.</p>
              </div>
            )}

            {videoTotalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-4)' }}>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={videoPage === 1}
                  onClick={() => setVideoPage(videoPage - 1)}
                >
                  ← Prev
                </button>
                <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                  Page {videoPage} of {videoTotalPages}
                </span>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={videoPage === videoTotalPages}
                  onClick={() => setVideoPage(videoPage + 1)}
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Grant Subscription Modal */}
      {grantModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, backdropFilter: 'blur(8px)',
        }}
          onClick={() => setGrantModal(null)}
        >
          <div className="card animate-scale-in" style={{
            maxWidth: '400px', width: '90%', padding: 'var(--space-8)',
          }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ fontSize: 'var(--font-size-xl)', fontWeight: '700', marginBottom: 'var(--space-2)' }}>
              Grant Subscription
            </h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-6)' }}>
              Grant a free subscription to <strong>{grantModal.userName}</strong>
            </p>
            <div className="input-group" style={{ marginBottom: 'var(--space-6)' }}>
              <label>Plan</label>
              <select
                className="input"
                value={grantPlan}
                onChange={e => setGrantPlan(e.target.value)}
              >
                <option value="weekly">Weekly (7 days)</option>
                <option value="monthly">Monthly (30 days)</option>
                <option value="yearly">Yearly (365 days)</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setGrantModal(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleGrantSubscription}>
                Grant Access
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

// --- Sub-components ---

function StatCard({ icon, label, value }) {
  return (
    <div className="card" style={{
      display: 'flex', alignItems: 'center', gap: 'var(--space-4)',
      padding: 'var(--space-5) var(--space-6)',
    }}>
      <div style={{
        fontSize: '1.8rem',
        width: '50px', height: '50px',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--color-bg-glass)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: '800', lineHeight: 1.2 }}>{value}</div>
        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</div>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    active: 'badge-success',
    pending: 'badge-warning',
    expired: 'badge-accent',
    cancelled: 'badge-accent',
  };
  return (
    <span className={`badge ${map[status] || 'badge-accent'}`} style={{ textTransform: 'capitalize' }}>
      {status}
    </span>
  );
}

function TableWrapper({ children }) {
  return (
    <div style={{
      overflowX: 'auto',
      borderRadius: 'var(--radius-xl)',
      border: '1px solid var(--color-border)',
      background: 'var(--color-bg-card)',
    }}>
      <style>{`
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: var(--space-3) var(--space-4); text-align: left; white-space: nowrap; }
        th { background: var(--color-bg-tertiary); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-text-muted); font-weight: 600; }
        tr:not(:last-child) td { border-bottom: 1px solid var(--color-border); }
        tr:hover td { background: var(--color-bg-glass); }
      `}</style>
      {children}
    </div>
  );
}
