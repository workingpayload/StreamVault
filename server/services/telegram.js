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
 * Debug: fetch 5 raw messages and return diagnostics.
 */
async function debugFetch() {
  const tg = getClient();
  const info = { channelId: process.env.TELEGRAM_CHANNEL_ID, connected: isConnected, messages: [], error: null };

  try {
    const entity = await getEntity();
    info.entityType = entity.className;

    const result = await tg.invoke(new Api.messages.GetHistory({
      peer: entity,
      offsetId: 0,
      offsetDate: 0,
      addOffset: 0,
      limit: 5,
      maxId: 0,
      minId: 0,
      hash: bigInt(0),
    }));

    info.totalCount = result.count;
    info.returnedCount = result.messages?.length || 0;

    for (const msg of (result.messages || [])) {
      const m = { id: msg.id, className: msg.className };
      if (msg.media) {
        m.mediaClassName = msg.media.className;
        if (msg.media.document) {
          m.mimeType = msg.media.document.mimeType;
          m.size = Number(msg.media.document.size);
          m.attributes = (msg.media.document.attributes || []).map(a => a.className);
        }
      }
      m.text = (msg.message || '').substring(0, 80);
      info.messages.push(m);
    }
  } catch (err) {
    info.error = err.message;
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

        const existing = get('SELECT id FROM video_cache WHERE telegram_message_id = ?', [msg.id]);

        if (existing) {
          run(
            `UPDATE video_cache SET title = ?, description = ?, duration = ?, file_size = ?,
             mime_type = ?, width = ?, height = ?, cached_at = datetime('now')
             WHERE telegram_message_id = ?`,
            [title, description,
              getVideoDuration(doc.attributes), Number(doc.size),
              doc.mimeType, getVideoWidth(doc.attributes), getVideoHeight(doc.attributes),
              msg.id]
          );
        } else {
          run(
            `INSERT INTO video_cache (telegram_message_id, title, description, duration, file_size, mime_type, width, height, cached_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
            [msg.id, title, description,
              getVideoDuration(doc.attributes), Number(doc.size),
              doc.mimeType, getVideoWidth(doc.attributes), getVideoHeight(doc.attributes)]
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
