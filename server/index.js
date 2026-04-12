require('dotenv').config();

const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');
const { initDb } = require('./database/init');
const { initTelegramClient, refreshVideoCache } = require('./services/telegram');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.SITE_URL
    : ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
}));

// Parse JSON for all routes except webhook (which needs raw body)
app.use((req, res, next) => {
  if (req.path === '/api/payments/webhook') {
    return next();
  }
  express.json()(req, res, next);
});

app.use(cookieParser());

// --- API Routes ---
app.use('/api/auth', require('./routes/auth'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/videos', require('./routes/videos'));
app.use('/api/admin', require('./routes/admin'));

// --- Health check ---
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- Serve static React build in production ---
if (process.env.NODE_ENV === 'production') {
  const clientBuildPath = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(clientBuildPath));

  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(clientBuildPath, 'index.html'));
    }
  });
}

// --- Error handler ---
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// --- Start server ---
async function start() {
  try {
    // Initialize database (async for sql.js)
    await initDb();
    console.log('✅ Database initialized');

    // Start the Express listener immediately so Railway Health Checks pass!
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n🚀 StreamVault server running on port ${PORT}`);
      console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    // Initialize Telegram client
    if (process.env.TELEGRAM_STRING_SESSION && process.env.TELEGRAM_STRING_SESSION !== 'your-string-session') {
      await initTelegramClient();

      // Run cache refresh completely asynchronously in the background
      refreshVideoCache()
        .then(count => console.log(`✅ Cached ${count} videos from Telegram channel`))
        .catch(err => {
          console.error('⚠️ Initial video cache refresh failed:', err.message);
          console.log('   Videos can be refreshed later via the Admin UI.');
        });
    } else {
      console.log('⚠️ Telegram not configured. Set TELEGRAM_STRING_SESSION in .env');
      console.log('   Run: npm run generate-session');
    }
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

// --- Graceful Shutdown ---
async function shutdown() {
  console.log('\n🛑 Shutting down server gracefully...');
  const { closeTelegramClient } = require('./services/telegram');
  await closeTelegramClient();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
// For nodemon restarts
process.on('SIGUSR2', async () => {
  const { closeTelegramClient } = require('./services/telegram');
  await closeTelegramClient();
  process.kill(process.pid, 'SIGUSR2');
});

start();
