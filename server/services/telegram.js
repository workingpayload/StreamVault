const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const bigInt = require('big-integer');
const { get, run, saveDb } = require('../database/init');
const path = require('path');
const fs = require('fs');

let client = null;
let isConnected = false;

const THUMBNAILS_DIR = path.join(__dirname, '..', '..', 'data', 'thumbnails');

// Global sync state — shared between startup and HTTP routes
const syncState = {
  running: false,
  type: null,
  startedAt: null,
  found: 0,
  result: null,
  error: null,
};

function getSyncState() { return syncState; }

/**
 * Initialize the gram.js MTProto client.
 */
async function initTelegramClient() {
  if (client && isConnected) return client;

  const apiId = parseInt(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH;
  const stringSession = new StringSession(process.env.TELEGRAM_STRING_SESSION || '');

  client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
    useWSS: false,
    floodSleepThreshold: 10, // Throw error instead of sleeping on flood waits > 10s
  });

  const maxRetries = 12;
  for (let i = 0; i < maxRetries; i++) {
    try {
      await client.connect();
      isConnected = true;
      console.log('✅ Telegram MTProto client connected');
      break;
    } catch (err) {
      if (err.message?.includes('AUTH_KEY_DUPLICATED') || err.errorMessage === 'AUTH_KEY_DUPLICATED') {
        console.warn(`⚠️ AUTH_KEY_DUPLICATED — waiting 5s... (${i + 1}/${maxRetries})`);
        await new Promise(res => setTimeout(res, 5000));
      } else {
        throw err;
      }
    }
  }

  if (!isConnected) {
    throw new Error('Timeout waiting for AUTH_KEY_DUPLICATED to resolve.');
  }

  if (!fs.existsSync(THUMBNAILS_DIR)) {
    fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });
  }

  return client;
}

function getClient() {
  if (!client || !isConnected) {
    throw new Error('Telegram client not initialized.');
  }
  return client;
}

async function closeTelegramClient() {
  if (client && isConnected) {
    try {
      await client.disconnect();
      isConnected = false;
      console.log('✅ Telegram client disconnected');
    } catch (err) {
      console.error('Disconnect error:', err.message);
    }
  }
}

/**
 * Resolve the channel entity.
 */
async function getEntity() {
  const tg = getClient();
  const channelId = process.env.TELEGRAM_CHANNEL_ID;
  if (/^-?\d+$/.test(channelId)) {
    return await tg.getEntity(BigInt(channelId));
  }
  return await tg.getEntity(channelId);
}

/**
 * Debug: layered diagnostics to find exactly where things break.
 */
async function debugFetch() {
  const info = {
    channelId: process.env.TELEGRAM_CHANNEL_ID,
    clientExists: !!client,
    isConnectedFlag: isConnected,
    clientConnected: client ? client.connected : false,
    steps: {},
  };

  if (!client) {
    info.steps.error = 'No client instance';
    return info;
  }

  // Step 1: Try reconnecting if needed
  try {
    if (!client.connected) {
      info.steps.reconnect = 'attempting...';
      await client.connect();
      info.steps.reconnect = 'reconnected';
    } else {
      info.steps.reconnect = 'already connected';
    }
  } catch (err) {
    info.steps.reconnect = 'failed: ' + err.message;
    return info;
  }

  // Step 2: Simplest API call — getMe()
  try {
    const me = await Promise.race([
      client.getMe(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT_10s')), 10000)),
    ]);
    info.steps.getMe = { ok: true, id: String(me.id), username: me.username };
  } catch (err) {
    info.steps.getMe = { ok: false, error: err.message };
    info.steps.diagnosis = 'Session may be invalid. Regenerate TELEGRAM_STRING_SESSION.';
    return info;
  }

  // Step 3: Resolve channel entity
  try {
    const entity = await Promise.race([
      getEntity(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT_10s')), 10000)),
    ]);
    info.steps.getEntity = { ok: true, type: entity.className };
  } catch (err) {
    info.steps.getEntity = { ok: false, error: err.message };
    info.steps.diagnosis = 'Cannot access channel. Check TELEGRAM_CHANNEL_ID.';
    return info;
  }

  // Step 4: Fetch 3 messages
  try {
    const entity = await getEntity();
    const result = await Promise.race([
      client.invoke(new Api.messages.GetHistory({
        peer: entity,
        offsetId: 0, offsetDate: 0, addOffset: 0,
        limit: 3, maxId: 0, minId: 0, hash: bigInt(0),
      })),
      new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT_10s')), 10000)),
    ]);
    info.steps.getHistory = { ok: true, total: result.count, returned: result.messages?.length || 0 };
    info.messages = (result.messages || []).map(msg => ({
      id: msg.id,
      hasMedia: !!msg.media,
      mediaType: msg.media?.className,
      mimeType: msg.media?.document?.mimeType,
      text: (msg.message || '').substring(0, 60),
    }));
  } catch (err) {
    info.steps.getHistory = { ok: false, error: err.message };
  }

  return info;
}

/**
 * Fetch video messages using raw Api.messages.GetHistory.
 * No wrappers, no generators — direct MTProto invoke with hard timeouts.
 */
async function refreshVideoCache(options = {}) {
  if (syncState.running) {
    console.warn('⚠️ Sync already running, skipping...');
    return 0;
  }

  syncState.running = true;
  syncState.type = options.type || 'new';
  syncState.startedAt = Date.now();
  syncState.found = 0;
  syncState.result = null;
  syncState.error = null;

  try {
    const tg = getClient();
    const entity = await getEntity();

    if (!fs.existsSync(THUMBNAILS_DIR)) {
      fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });
    }

    const batchSize = 100;
    const totalScan = options.scanLimit || 500;
    const maxVideos = options.maxVideos || 100;
    let offsetId = options.offsetId || 0;

    console.log(`📡 Sync start: scan=${totalScan}, maxVideos=${maxVideos}, offsetId=${offsetId}`);

    let count = 0;
    let scanned = 0;

    while (scanned < totalScan && count < maxVideos) {
      const limit = Math.min(batchSize, totalScan - scanned);

      let result;
      try {
        result = await Promise.race([
          tg.invoke(new Api.messages.GetHistory({
            peer: entity,
            offsetId: offsetId,
            offsetDate: 0,
            addOffset: 0,
            limit: limit,
            maxId: 0,
            minId: 0,
            hash: bigInt(0),
          })),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('API_TIMEOUT')), 30000)
          ),
        ]);
      } catch (err) {
        console.error(`   ❌ Batch error: ${err.message}`);
        break;
      }

      const messages = result?.messages || [];
      if (messages.length === 0) {
        console.log('   📭 No more messages');
        break;
      }

      console.log(`   📦 Got ${messages.length} msgs (channel total: ${result.count})`);

      for (const msg of messages) {
        if (!msg || !msg.media) continue;

        const doc = msg.media.document;
        if (!doc || !doc.mimeType) continue;

        const isVideo = doc.mimeType.startsWith('video/');
        if (!isVideo) continue;

        const caption = msg.message || '';
        const lines = caption.split('\n');
        const title = lines[0] || `Video ${msg.id}`;
        const description = lines.slice(1).join('\n').trim();

        const thumbPath = await downloadThumbnail(tg, doc, msg.id);

        const existing = get('SELECT id FROM video_cache WHERE telegram_message_id = ?', [msg.id]);

        if (existing) {
          run(
            `UPDATE video_cache SET title = ?, description = ?, duration = ?, file_size = ?,
             mime_type = ?, width = ?, height = ?, thumbnail_path = COALESCE(?, thumbnail_path),
             cached_at = datetime('now')
             WHERE telegram_message_id = ?`,
            [title, description,
              getVideoDuration(doc.attributes), Number(doc.size),
              doc.mimeType, getVideoWidth(doc.attributes), getVideoHeight(doc.attributes),
              thumbPath, msg.id]
          );
        } else {
          run(
            `INSERT INTO video_cache (telegram_message_id, title, description, duration, file_size, thumbnail_path, mime_type, width, height, cached_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
            [msg.id, title, description,
              getVideoDuration(doc.attributes), Number(doc.size),
              thumbPath, doc.mimeType, getVideoWidth(doc.attributes), getVideoHeight(doc.attributes)]
          );
        }

        count++;
        syncState.found = count;
        if (count >= maxVideos) break;
      }

      saveDb();
      scanned += messages.length;
      console.log(`   📹 ${count} videos / ${scanned} scanned`);

      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.id) {
        offsetId = lastMsg.id;
      } else {
        break;
      }

      if (messages.length < limit) {
        console.log('   📭 End of history');
        break;
      }
    }

    console.log(`✅ Done: ${count} videos from ${scanned} messages`);

    syncState.running = false;
    syncState.result = { count, message: `Synced ${count} videos` };
    return count;
  } catch (err) {
    syncState.running = false;
    syncState.error = err.message;
    console.error('❌ Sync failed:', err.message);
    throw err;
  }
}

/**
 * Stream a video file from Telegram by message ID.
 */
async function streamVideo(messageId, req, res) {
  const tg = getClient();
  const entity = await getEntity();

  const messages = await tg.getMessages(entity, { ids: [parseInt(messageId)] });
  if (!messages || messages.length === 0 || !messages[0]) {
    return res.status(404).json({ error: 'Video not found' });
  }

  const message = messages[0];
  const media = message.video || message.document;

  if (!media) {
    return res.status(404).json({ error: 'No video in this message' });
  }

  const fileSize = Number(media.size);
  const mimeType = media.mimeType || 'video/mp4';

  const range = req.headers.range;
  let start = 0;
  let end = fileSize - 1;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    start = parseInt(parts[0], 10);
    end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (start >= fileSize) {
      res.status(416).set('Content-Range', `bytes */${fileSize}`);
      return res.end();
    }
    end = Math.min(end, fileSize - 1);

    res.status(206);
    res.set({
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': mimeType,
    });
  } else {
    res.status(200);
    res.set({
      'Accept-Ranges': 'bytes',
      'Content-Length': fileSize,
      'Content-Type': mimeType,
    });
  }

  const fileLocation = new Api.InputDocumentFileLocation({
    id: media.id,
    accessHash: media.accessHash,
    fileReference: media.fileReference,
    thumbSize: '',
  });

  const CHUNK_SIZE = 1024 * 1024;
  const targetEnd = end + 1;
  const alignedStart = start - (start % CHUNK_SIZE);
  let currentOffset = alignedStart;
  let isFirstChunk = true;

  try {
    while (currentOffset < targetEnd) {
      if (res.destroyed) break;

      const result = await tg.invoke(
        new Api.upload.GetFile({
          location: fileLocation,
          offset: bigInt(currentOffset),
          limit: CHUNK_SIZE,
        })
      );

      if (!result || !result.bytes || result.bytes.length === 0) break;

      let data = Buffer.from(result.bytes);

      if (isFirstChunk && start > alignedStart) {
        data = data.subarray(start - alignedStart);
        isFirstChunk = false;
      }

      const endOfThisChunk = currentOffset + result.bytes.length;
      if (endOfThisChunk > targetEnd) {
        const excess = endOfThisChunk - targetEnd;
        data = data.subarray(0, data.length - excess);
      }

      if (data.length > 0) {
        const canWrite = res.write(data);
        if (!canWrite) {
          await new Promise((resolve) => res.once('drain', resolve));
        }
      }

      currentOffset += CHUNK_SIZE;
      isFirstChunk = false;
      if (currentOffset >= targetEnd) break;
    }
  } catch (err) {
    console.error('Stream error:', err.message);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Streaming failed' });
    }
  }

  res.end();
}

async function downloadThumbnail(tg, doc, messageId) {
  try {
    const thumbs = doc.thumbs;
    if (!thumbs || thumbs.length === 0) return null;

    const thumb = thumbs[thumbs.length - 1];
    const thumbPath = path.join(THUMBNAILS_DIR, `${messageId}.jpg`);

    if (fs.existsSync(thumbPath)) return thumbPath;

    const buffer = await Promise.race([
      tg.downloadMedia(doc, { thumb: thumb }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('THUMB_TIMEOUT')), 10000)),
    ]);

    if (buffer && buffer.length > 0) {
      fs.writeFileSync(thumbPath, buffer);
      return thumbPath;
    }
    return null;
  } catch (err) {
    console.error(`   ⚠️ Thumb ${messageId}: ${err.message}`);
    return null;
  }
}

function getVideoDuration(attributes) {
  if (!attributes) return null;
  for (const attr of attributes) {
    if (attr.className === 'DocumentAttributeVideo' && attr.duration) return attr.duration;
  }
  return null;
}

function getVideoWidth(attributes) {
  if (!attributes) return null;
  for (const attr of attributes) {
    if (attr.className === 'DocumentAttributeVideo' && attr.w) return attr.w;
  }
  return null;
}

function getVideoHeight(attributes) {
  if (!attributes) return null;
  for (const attr of attributes) {
    if (attr.className === 'DocumentAttributeVideo' && attr.h) return attr.h;
  }
  return null;
}

module.exports = {
  initTelegramClient,
  closeTelegramClient,
  getClient,
  getSyncState,
  debugFetch,
  refreshVideoCache,
  streamVideo,
};
