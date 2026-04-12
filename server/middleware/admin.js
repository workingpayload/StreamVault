const { get } = require('../database/init');

/**
 * Middleware to check if the user is an admin.
 * Admin is identified by the ADMIN_EMAIL environment variable.
 * Must be used AFTER authenticate middleware.
 */
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const adminEmail = process.env.ADMIN_EMAIL;

  if (!adminEmail) {
    return res.status(403).json({ error: 'Admin not configured' });
  }

  // Support multiple admin emails separated by commas
  const adminEmails = adminEmail.split(',').map(e => e.trim().toLowerCase());

  if (!adminEmails.includes(req.user.email.toLowerCase())) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  req.isAdmin = true;
  next();
}

module.exports = { requireAdmin };
