const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'streamvault.db');

let db = null;
let SQL = null;

/**
 * Initialize and return the SQLite database.
 * Uses sql.js (pure JavaScript, no native dependencies).
 */
async function initDb() {
  if (db) return db;

  // Ensure data directory exists
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  SQL = await initSqlJs();

  // Load existing database or create new one
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  initializeSchema();
  return db;
}

/**
 * Get the database instance (must call initDb first).
 */
function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return db;
}

/**
 * Save the database to disk.
 */
function saveDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

/**
 * Create tables if they don't exist.
 */
function initializeSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      plan TEXT NOT NULL CHECK(plan IN ('weekly', 'monthly', 'yearly')),
      amount INTEGER NOT NULL,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'active', 'expired', 'cancelled')),
      starts_at DATETIME,
      expires_at DATETIME,
      razorpay_order_id TEXT,
      razorpay_payment_id TEXT,
      razorpay_signature TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS video_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_message_id INTEGER UNIQUE NOT NULL,
      title TEXT,
      description TEXT,
      duration INTEGER,
      file_size INTEGER,
      thumbnail_path TEXT,
      mime_type TEXT,
      width INTEGER,
      height INTEGER,
      cached_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create indexes
  db.run('CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status)');
  db.run('CREATE INDEX IF NOT EXISTS idx_video_cache_message_id ON video_cache(telegram_message_id)');

  saveDb();
}

/**
 * Helper: Run a query and return all results as an array of objects.
 */
function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

/**
 * Helper: Run a query and return the first result as an object, or null.
 */
function get(sql, params = []) {
  const results = all(sql, params);
  return results.length > 0 ? results[0] : null;
}

/**
 * Helper: Run an INSERT/UPDATE/DELETE and return lastInsertRowid / changes.
 */
function run(sql, params = []) {
  db.run(sql, params);
  const info = db.exec('SELECT last_insert_rowid() as id, changes() as changes');
  const result = {
    lastInsertRowid: info.length > 0 ? info[0].values[0][0] : 0,
    changes: info.length > 0 ? info[0].values[0][1] : 0,
  };
  saveDb(); // Auto-save after mutations
  return result;
}

module.exports = { initDb, getDb, saveDb, all, get, run };
