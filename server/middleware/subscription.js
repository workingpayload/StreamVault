const { get } = require('../database/init');

/**
 * Middleware to check if the authenticated user has an active subscription.
 * Must be used AFTER the authenticate middleware.
 */
function requireSubscription(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Admin users bypass subscription check
  const adminEmail = process.env.ADMIN_EMAIL || '';
  const adminEmails = adminEmail.split(',').map(e => e.trim().toLowerCase());
  if (adminEmails.includes(req.user.email.toLowerCase())) {
    req.subscription = { plan: 'admin', status: 'active' };
    return next();
  }

  const subscription = get(
    `SELECT * FROM subscriptions
     WHERE user_id = ? AND status = 'active' AND expires_at > datetime('now')
     ORDER BY expires_at DESC
     LIMIT 1`,
    [req.user.id]
  );

  if (!subscription) {
    return res.status(403).json({
      error: 'Active subscription required',
      code: 'NO_SUBSCRIPTION',
      message: 'Please subscribe to access this content.',
    });
  }

  req.subscription = subscription;
  next();
}

module.exports = { requireSubscription };
