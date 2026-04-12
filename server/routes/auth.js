const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { get, run } = require('../database/init');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/auth/register
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    const existing = get('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = run(
      'INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)',
      [email.toLowerCase(), passwordHash, name.trim()]
    );

    const userId = result.lastInsertRowid;

    const accessToken = generateAccessToken({ id: userId, email: email.toLowerCase(), name: name.trim() });
    const refreshToken = generateRefreshToken({ id: userId });

    setRefreshCookie(res, refreshToken);

    res.status(201).json({
      message: 'Account created successfully',
      accessToken,
      user: { id: userId, email: email.toLowerCase(), name: name.trim() },
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/login
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = get('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const accessToken = generateAccessToken({ id: user.id, email: user.email, name: user.name });
    const refreshToken = generateRefreshToken({ id: user.id });

    setRefreshCookie(res, refreshToken);

    res.json({
      message: 'Login successful',
      accessToken,
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/refresh
 */
router.post('/refresh', (req, res) => {
  const refreshTokenVal = req.cookies?.refreshToken;

  if (!refreshTokenVal) {
    return res.status(401).json({ error: 'No refresh token' });
  }

  try {
    const decoded = jwt.verify(refreshTokenVal, process.env.JWT_REFRESH_SECRET);
    const user = get('SELECT id, email, name FROM users WHERE id = ?', [decoded.id]);

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const accessToken = generateAccessToken({ id: user.id, email: user.email, name: user.name });
    const newRefreshToken = generateRefreshToken({ id: user.id });

    setRefreshCookie(res, newRefreshToken);

    res.json({ accessToken });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid refresh token' });
  }
});

/**
 * GET /api/auth/me
 */
router.get('/me', authenticate, (req, res) => {
  const subscription = get(
    `SELECT plan, status, starts_at, expires_at, amount
     FROM subscriptions
     WHERE user_id = ? AND status = 'active' AND expires_at > datetime('now')
     ORDER BY expires_at DESC
     LIMIT 1`,
    [req.user.id]
  );

  // Check admin status
  const adminEmail = process.env.ADMIN_EMAIL || '';
  const adminEmails = adminEmail.split(',').map(e => e.trim().toLowerCase());
  const isAdmin = adminEmails.includes(req.user.email.toLowerCase());

  res.json({
    user: { id: req.user.id, email: req.user.email, name: req.user.name },
    subscription: subscription || null,
    isAdmin,
  });
});

/**
 * POST /api/auth/logout
 */
router.post('/logout', (req, res) => {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  });
  res.json({ message: 'Logged out successfully' });
});

// --- Helpers ---

function generateAccessToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '15m' });
}

function generateRefreshToken(payload) {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
}

function setRefreshCookie(res, token) {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

module.exports = router;
