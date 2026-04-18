# Codemap
> Auto-generated 2026-04-18. Checkpoint: on-demand (/codemap).

## Project
- **Name**: streamvault — subscription-based video streaming backed by a Telegram channel
- **Language**: Node.js (CommonJS backend), JavaScript + JSX (React frontend)
- **Framework**: Express 4 (API), React 18 + React Router 6 + Vite 5 (UI)
- **Package manager**: npm (root + `client/` workspace via `postinstall`)
- **Database**: SQLite via `sql.js` (pure JS, file at `data/streamvault.db`)
- **External services**: Telegram MTProto (`telegram` / gram.js), Razorpay (payments), Railway (deploy)
- **Monorepo**: no — single repo with `server/` and `client/` folders

## Directory Map
```
.
├── server/                      # Express API [entry: index.js]
│   ├── index.js                 # App factory, middleware, router mount, bootstrap
│   ├── database/init.js         # sql.js init, schema, helpers all/get/run/saveDb
│   ├── routes/                  # HTTP route handlers [route]
│   │   ├── auth.js              # register / login / refresh / me / logout
│   │   ├── payments.js          # plans / create-order / verify / webhook
│   │   ├── videos.js            # list / sync / stream / thumbnail / info / debug
│   │   └── admin.js             # dashboard / users / subscriptions / videos / grant
│   ├── services/                # External integrations [service]
│   │   ├── telegram.js          # MTProto client, refreshVideoCache, streamVideo
│   │   └── razorpay.js          # Order creation + signature verification
│   └── middleware/              # Request interceptors [middleware]
│       ├── auth.js              # JWT authenticate / optionalAuth
│       ├── admin.js             # requireAdmin (email-whitelist)
│       └── subscription.js      # requireSubscription (active sub gate)
├── client/                      # React SPA [entry: src/main.jsx]
│   ├── index.html
│   ├── vite.config.js           # Vite + /api proxy → localhost:3000
│   └── src/
│       ├── main.jsx             # ReactDOM root, Router + AuthProvider
│       ├── App.jsx              # Route table, loading gate
│       ├── context/AuthContext.jsx  # login/register/logout/refresh state
│       ├── utils/api.js         # fetch wrapper + token refresh, formatters
│       ├── components/          # Navbar, Footer, PricingCard, VideoCard, ProtectedRoute [ui]
│       └── pages/               # Landing, Login, Register, Browse, Watch, Pricing, Account, Admin [ui]
├── scripts/
│   └── generate-session.js      # CLI: produce TELEGRAM_STRING_SESSION [script]
├── data/                        # Runtime state (gitignored)
│   ├── streamvault.db
│   └── thumbnails/
├── package.json                 # Root scripts: dev/server:dev/client:dev/build/start
├── railway.json                 # Railway NIXPACKS build + start config [infra]
└── .env                         # Secrets (gitignored) [config]
```

## Entry Points
| File | Role | Description |
|------|------|-------------|
| `server/index.js` | entry | Express bootstrap, mounts routers, initDb, initTelegramClient (optional), serves `client/dist` in prod |
| `client/src/main.jsx` | entry | ReactDOM.createRoot, wraps App with BrowserRouter + AuthProvider |
| `client/src/App.jsx` | entry | React Router route table, ProtectedRoute gate |
| `scripts/generate-session.js` | script | One-off CLI to generate Telegram StringSession for `.env` |

## API Routes
| Method + path | Auth | File |
|---|---|---|
| `GET /api/health` | public | `server/index.js:38` |
| `POST /api/auth/register` | public | `server/routes/auth.js:12` |
| `POST /api/auth/login` | public | `server/routes/auth.js:62` |
| `POST /api/auth/refresh` | cookie | `server/routes/auth.js:100` |
| `GET /api/auth/me` | JWT | `server/routes/auth.js:129` |
| `POST /api/auth/logout` | public | `server/routes/auth.js:154` |
| `GET /api/payments/plans` | public | `server/routes/payments.js:11` |
| `POST /api/payments/create-order` | JWT | `server/routes/payments.js:19` |
| `POST /api/payments/verify` | JWT | `server/routes/payments.js:45` |
| `POST /api/payments/webhook` | HMAC | `server/routes/payments.js:120` (raw body) |
| `GET /api/videos/debug` | public | `server/routes/videos.js:14` (15s route-level timeout) |
| `GET /api/videos` | JWT | `server/routes/videos.js:43` |
| `POST /api/videos/refresh` | JWT | `server/routes/videos.js:88` (new videos) |
| `POST /api/videos/refresh-older` | JWT | `server/routes/videos.js:101` |
| `GET /api/videos/sync-status` | JWT | `server/routes/videos.js:121` |
| `GET /api/videos/:id/stream` | JWT + sub | `server/routes/videos.js:154` (range-aware) |
| `GET /api/videos/:id/thumbnail` | public | `server/routes/videos.js:168` |
| `GET /api/videos/:id/info` | JWT | `server/routes/videos.js:186` |
| `GET /api/admin/*` | JWT + admin | `server/routes/admin.js` (all prefixed) |
| `POST /api/admin/users/:id/grant` | JWT + admin | `server/routes/admin.js:168` |
| `DELETE /api/admin/videos/:id` | JWT + admin | `server/routes/admin.js:154` |

## Data Model (SQLite schema — `server/database/init.js:60`)
- **users**: `id, email UNIQUE, password_hash, name, created_at`
- **subscriptions**: `id, user_id→users, plan(weekly|monthly|yearly), amount(paise), status(pending|active|expired|cancelled), starts_at, expires_at, razorpay_order_id, razorpay_payment_id, razorpay_signature, created_at` — indexes on `user_id`, `status`
- **video_cache**: `id, telegram_message_id UNIQUE, title, description, duration, file_size, thumbnail_path, mime_type, width, height, cached_at` — index on `telegram_message_id`

## Module Map

### `server/services/telegram.js` [service] (464 lines — hottest file)
- **Does**: MTProto client lifecycle, channel entity resolution, raw `Api.messages.GetHistory` paging into `video_cache`, range-aware streaming via `Api.upload.GetFile` 1 MB chunks, layered debug diagnostics
- **Exports**: `initTelegramClient`, `closeTelegramClient`, `getClient`, `getSyncState`, `debugFetch`, `refreshVideoCache`, `streamVideo`
- **State**: module-level `client`, `isConnected`, `syncState` (single-flight sync guard)
- **Depends on**: `telegram`, `big-integer`, `database/init` (get/run/saveDb), `fs`, `path`
- **Notes**: `floodSleepThreshold: 10` → throws on long flood waits; 30s per-batch timeout, 10s per debug step; no startup auto-sync (manual trigger only)

### `server/services/razorpay.js` [service]
- **Does**: Razorpay singleton, plan config from env (`PRICE_WEEKLY|MONTHLY|YEARLY`), order creation, HMAC-SHA256 signature + webhook verification
- **Exports**: `getRazorpay`, `getPlans`, `createOrder`, `verifySignature`, `verifyWebhookSignature`
- **Depends on**: `razorpay`, `crypto`

### `server/database/init.js` [repo / config]
- **Does**: sql.js init, schema DDL, auto-save after each mutation
- **Exports**: `initDb`, `getDb`, `saveDb`, `all`, `get`, `run`
- **Depends on**: `sql.js`, `fs`, `path`

### `server/middleware/auth.js` [middleware]
- **Exports**: `authenticate` (Bearer OR `?token=` query param for `<video>` src), `optionalAuth`
- **Returns**: `TOKEN_EXPIRED` code on expiry → client triggers refresh

### `server/middleware/subscription.js` [middleware]
- **Exports**: `requireSubscription` — admin emails bypass; else SQL check for active, non-expired sub

### `server/middleware/admin.js` [middleware]
- **Exports**: `requireAdmin` — compares `req.user.email` against comma-separated `ADMIN_EMAIL`

### `client/src/context/AuthContext.jsx` [ui / state]
- **Exports**: `AuthProvider`, `useAuth`
- **State**: `user`, `subscription`, `isAdmin`, `loading`; actions `login`, `register`, `logout`, `refreshUser`, derived `isSubscribed`
- **Depends on**: `utils/api` (`api`, `setToken`, `clearToken`, `getToken`, `refreshToken`)

### `client/src/utils/api.js` [util]
- **Exports**: `api`, `getToken`, `setToken`, `clearToken`, `refreshToken`, `formatFileSize`, `formatDuration`, `formatPrice`
- **Behavior**: fetch wrapper, auto-retries once on `TOKEN_EXPIRED` after `/auth/refresh`

### `client/src/pages/Admin.jsx` [ui] (547 lines — largest UI file)
- Admin dashboard: stats, users table, subscriptions table, videos manager, manual grant form

### `client/src/pages/Browse.jsx` [ui] (359 lines)
- Video grid, pagination, sorting, sync trigger + sync-status polling

### `client/src/pages/Watch.jsx` [ui]
- `<video>` player pointed at `/api/videos/:id/stream?token=...`

## Dependency Flow
```
[browser] main.jsx → App.jsx → pages/* → context/AuthContext → utils/api
                                                                ↓ fetch /api/*
                                                               [HTTP]
[server] index.js
     ├── routes/auth.js        → database/init (users, subscriptions)
     ├── routes/payments.js    → services/razorpay + database/init (subscriptions)
     ├── routes/videos.js      → middleware/{auth,subscription}
     │                         → services/telegram (syncState, refreshVideoCache, streamVideo, debugFetch)
     │                         → database/init (video_cache)
     └── routes/admin.js       → middleware/{auth,admin} → database/init (all tables)

services/telegram.js --[MTProto]--> Telegram servers
services/razorpay.js --[HTTPS]----> Razorpay API
```

## Hot Files (most-changed, all history)
| File | Commits | Notes |
|------|---------|-------|
| `server/services/telegram.js` | 13 | Active debugging area: flood handling, sync state, timeouts |
| `server/routes/videos.js` | 11 | Debug route, sync endpoints, stream route |
| `server/index.js` | 6 | Startup sequencing (removed auto-sync) |
| `client/src/pages/Browse.jsx` | 6 | Sync UI + polling |
| `client/src/pages/Watch.jsx` | 4 | Player fixes |
| `server/middleware/subscription.js` | 3 | Admin bypass |

## Active Work Area (last 5 commits — from `git log`)
- `a033542` Fix emoji rendering, fix Unicode escapes in JSX
- `fca69ba` Layered debug diagnostics (connection / getMe / getEntity / getHistory) with independent timeouts
- `afcadf9` Wrap debug test in route-level `Promise.race` timeout
- `e743150` Remove startup auto-sync, debug endpoint no-hang
- `1743cb2` `floodSleepThreshold=10s` + debug timeout

Focus: Telegram sync reliability + debug endpoint hardening.

## Environment (`.env` keys referenced in code)
- `PORT`, `NODE_ENV`, `SITE_URL`
- `JWT_SECRET`, `JWT_REFRESH_SECRET`
- `ADMIN_EMAIL` (comma-separated list supported)
- `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TELEGRAM_STRING_SESSION`, `TELEGRAM_CHANNEL_ID`
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
- `PRICE_WEEKLY`, `PRICE_MONTHLY`, `PRICE_YEARLY` (amounts in paise)

## Build / Run
- `npm run dev` — concurrently runs `server:dev` (node --watch) + `client:dev` (vite)
- `npm run build` — builds client into `client/dist`
- `npm start` — prod: server serves `client/dist` + API
- `npm run generate-session` — interactive CLI for Telegram StringSession
