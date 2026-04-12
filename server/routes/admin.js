const express = require('express');
const { all, get, run } = require('../database/init');
const { authenticate } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin');

const router = express.Router();

// All admin routes require authentication + admin check
router.use(authenticate);
router.use(requireAdmin);

/**
 * GET /api/admin/dashboard
 * Overview stats for the admin dashboard.
 */
router.get('/dashboard', (req, res) => {
  try {
    const totalUsers = get('SELECT COUNT(*) as count FROM users') || { count: 0 };
    const activeSubscriptions = get(
      `SELECT COUNT(*) as count FROM subscriptions
       WHERE status = 'active' AND expires_at > datetime('now')`
    ) || { count: 0 };
    const totalVideos = get('SELECT COUNT(*) as count FROM video_cache') || { count: 0 };

    const totalRevenue = get(
      `SELECT COALESCE(SUM(amount), 0) as total FROM subscriptions
       WHERE status = 'active'`
    ) || { total: 0 };

    const recentSubscriptions = all(
      `SELECT s.id, s.plan, s.status, s.amount, s.starts_at, s.expires_at, s.created_at,
              u.name as user_name, u.email as user_email
       FROM subscriptions s
       JOIN users u ON s.user_id = u.id
       ORDER BY s.created_at DESC
       LIMIT 10`
    );

    const planBreakdown = all(
      `SELECT plan, COUNT(*) as count, SUM(amount) as revenue
       FROM subscriptions
       WHERE status = 'active' AND expires_at > datetime('now')
       GROUP BY plan`
    );

    res.json({
      stats: {
        totalUsers: totalUsers.count,
        activeSubscriptions: activeSubscriptions.count,
        totalVideos: totalVideos.count,
        totalRevenue: totalRevenue.total,
      },
      recentSubscriptions,
      planBreakdown,
    });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

/**
 * GET /api/admin/users
 * List all users with their subscription status.
 */
router.get('/users', (req, res) => {
  try {
    const users = all(`
      SELECT
        u.id, u.email, u.name, u.created_at,
        s.plan as active_plan,
        s.status as sub_status,
        s.expires_at as sub_expires_at
      FROM users u
      LEFT JOIN subscriptions s ON s.user_id = u.id
        AND s.status = 'active'
        AND s.expires_at > datetime('now')
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);

    res.json({ users });
  } catch (err) {
    console.error('Admin users error:', err);
    res.status(500).json({ error: 'Failed to load users' });
  }
});

/**
 * GET /api/admin/subscriptions
 * List all subscriptions (all statuses).
 */
router.get('/subscriptions', (req, res) => {
  try {
    const subscriptions = all(`
      SELECT
        s.id, s.plan, s.status, s.amount, s.starts_at, s.expires_at,
        s.razorpay_order_id, s.razorpay_payment_id, s.created_at,
        u.name as user_name, u.email as user_email
      FROM subscriptions s
      JOIN users u ON s.user_id = u.id
      ORDER BY s.created_at DESC
    `);

    res.json({ subscriptions });
  } catch (err) {
    console.error('Admin subscriptions error:', err);
    res.status(500).json({ error: 'Failed to load subscriptions' });
  }
});

/**
 * GET /api/admin/videos
 * List all cached videos.
 */
router.get('/videos', (req, res) => {
  try {
    const videos = all(`
      SELECT
        telegram_message_id as id, title, description, duration,
        file_size, mime_type, width, height, cached_at
      FROM video_cache
      ORDER BY telegram_message_id DESC
    `);

    res.json({ videos });
  } catch (err) {
    console.error('Admin videos error:', err);
    res.status(500).json({ error: 'Failed to load videos' });
  }
});

/**
 * DELETE /api/admin/videos/:id
 * Remove a video from the cache (doesn't delete from Telegram).
 */
router.delete('/videos/:id', (req, res) => {
  try {
    run('DELETE FROM video_cache WHERE telegram_message_id = ?', [parseInt(req.params.id)]);
    res.json({ message: 'Video removed from cache' });
  } catch (err) {
    console.error('Admin delete video error:', err);
    res.status(500).json({ error: 'Failed to delete video' });
  }
});

/**
 * POST /api/admin/users/:id/grant
 * Manually grant a subscription to a user (for free/promo access).
 */
router.post('/users/:id/grant', (req, res) => {
  try {
    const { plan, days } = req.body;

    if (!plan || !['weekly', 'monthly', 'yearly'].includes(plan)) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    const userId = parseInt(req.params.id);
    const user = get('SELECT id FROM users WHERE id = ?', [userId]);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const durationMap = { weekly: 7, monthly: 30, yearly: 365 };
    const duration = days || durationMap[plan];

    const now = new Date();
    const expiresAt = new Date(now);

    // Extend from existing active subscription if present
    const existing = get(
      `SELECT expires_at FROM subscriptions
       WHERE user_id = ? AND status = 'active' AND expires_at > datetime('now')
       ORDER BY expires_at DESC LIMIT 1`,
      [userId]
    );

    let startsAt;
    if (existing) {
      startsAt = new Date(existing.expires_at);
      expiresAt.setTime(startsAt.getTime());
    } else {
      startsAt = now;
    }

    expiresAt.setDate(expiresAt.getDate() + duration);

    run(
      `INSERT INTO subscriptions (user_id, plan, amount, status, starts_at, expires_at, razorpay_order_id)
       VALUES (?, ?, 0, 'active', ?, ?, ?)`,
      [userId, plan, startsAt.toISOString(), expiresAt.toISOString(), `admin_grant_${Date.now()}`]
    );

    res.json({
      message: 'Subscription granted',
      expiresAt: expiresAt.toISOString(),
    });
  } catch (err) {
    console.error('Admin grant error:', err);
    res.status(500).json({ error: 'Failed to grant subscription' });
  }
});

module.exports = router;
