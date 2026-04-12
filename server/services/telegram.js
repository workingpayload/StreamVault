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

  const maxRetries = 12; // 60 seconds total wait
  for (let i = 0; i < maxRetries; i++) {
    try {
      await client.connect();
      isConnected = true;
      console.log('✅ Telegram MTProto client connected');
      break;
    } catch (err) {
      if (err.message?.includes('AUTH_KEY_DUPLICATED') || err.errorMessage === 'AUTH_KEY_DUPLICATED') {
        console.warn(`⚠️ Telegram session duplicated (likely Railway zero-downtime deployment overlay). Waiting 5s for old instance to disconnect... (${i + 1}/${maxRetries})`);
        await new Promise(res => setTimeout(res, 5000));
      } else {
        throw err;
      }
    }
  }

  if (!isConnected) {
    throw new Error('Timeout waiting for AUTH_KEY_DUPLICATED to resolve. Make sure no other instances or local servers are running the same session!');
  }

  // Ensure thumbnails directory exists
  if (!fs.existsSync(THUMBNAILS_DIR)) {
    fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });
  }

  return client;
}

/**
 * Get the Telegram client instance.
 */
function getClient() {
  if (!client || !isConnected) {
    throw new Error('Telegram client not initialized. Call initTelegramClient() first.');
  }
  return client;
}

/**
 * Disconnect the Telegram client gracefully.
 */
async function closeTelegramClient() {
  if (client && isConnected) {
    try {
      console.log('🔄 Disconnecting Telegram client...');
      await client.disconnect();
      isConnected = false;
      console.log('✅ Telegram client disconnected gracefully');
    } catch (err) {
      console.error('Failed to disconnect Telegram client:', err.message);
    }
  }
}

/**
 * Fetch video messages from the configured Telegram channel
 * and cache their metadata in the database.
 * Uses tg.getMessages() (single API call) with a hard timeout.
 */
async function refreshVideoCache(options = {}) {
  if (syncState.running) {
    console.warn('⚠️ A sync is already running, skipping...');
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
    const channelId = process.env.TELEGRAM_CHANNEL_ID;

    const batchSize = 100; // Messages per API call (Telegram max)
    const totalScan = options.scanLimit || 500; // Total messages to scan
    const maxVideos = options.maxVideos || 100; // Stop after this many videos
    let offsetId = options.offsetId || 0;

    let entity;
    try {
      if (/^-?\d+$/.test(channelId)) {
        entity = await tg.getEntity(BigInt(channelId));
      } else {
        entity = await tg.getEntity(channelId);
      }
    } catch (err) {
      console.error('Failed to get channel entity:', err.message);
      throw new Error('Could not access Telegram channel. Check TELEGRAM_CHANNEL_ID.');
    }

    console.log(`📡 Scanning up to ${totalScan} messages (offsetId=${offsetId}, maxVideos=${maxVideos})`);

    let count = 0;
    let scanned = 0;
    const thumbMessages = [];

    // Fetch in batches of 100, with a hard 30s timeout per batch
    while (scanned < totalScan && count < maxVideos) {
      const remaining = Math.min(batchSize, totalScan - scanned);

      console.log(`   📦 Fetching batch: ${remaining} messages (offset=${offsetId}, scanned=${scanned})`);

      let messages;
      try {
        // Hard 30-second timeout per API call using Promise.race
        messages = await Promise.race([
          tg.getMessages(entity, {
            limit: remaining,
            offsetId: offsetId,
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('API_TIMEOUT')), 30000)
          ),
        ]);
      } catch (err) {
        if (err.message === 'API_TIMEOUT') {
          console.warn('⏱️ Telegram API call timed out after 30s, saving what we have...');
          break;
        }
        // Flood wait — gram.js auto-handles these, but if it takes too long we break
        console.error(`   ❌ Batch fetch error: ${err.message}`);
        break;
      }

      if (!messages || messages.length === 0) {
        console.log('   📭 No more messages in channel');
        break;
      }

      // Process this batch
      for (const message of messages) {
        if (!message) continue;

        if (message.video || (message.document && message.document.mimeType && message.document.mimeType.startsWith('video/'))) {
          const media = message.video || message.document;
          const caption = message.message || '';
          const lines = caption.split('\n');
          const title = lines[0] || `Video ${message.id}`;
          const description = lines.slice(1).join('\n').trim();

          const existing = get('SELECT id FROM video_cache WHERE telegram_message_id = ?', [message.id]);

          if (existing) {
            run(
              `UPDATE video_cache SET title = ?, description = ?, duration = ?, file_size = ?,
               mime_type = ?, width = ?, height = ?, cached_at = datetime('now')
               WHERE telegram_message_id = ?`,
              [title, description,
                media.attributes ? getVideoDuration(media.attributes) : null,
                media.size ? Number(media.size) : null,
                media.mimeType || 'video/mp4',
                getVideoWidth(media.attributes), getVideoHeight(media.attributes),
                message.id]
            );
          } else {
            run(
              `INSERT INTO video_cache (telegram_message_id, title, description, duration, file_size, mime_type, width, height, cached_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
              [message.id, title, description,
                media.attributes ? getVideoDuration(media.attributes) : null,
                media.size ? Number(media.size) : null,
                media.mimeType || 'video/mp4',
                getVideoWidth(media.attributes), getVideoHeight(media.attributes)]
            );
          }

          count++;
          syncState.found = count;
          thumbMessages.push(message);

          if (count >= maxVideos) break;
        }
      }

      // Save after each batch
      saveDb();
      console.log(`   📹 ${count} videos cached (${scanned + messages.length} messages scanned)`);

      scanned += messages.length;

      // Use the last message's ID as the offset for next batch
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && lastMsg.id) {
        offsetId = lastMsg.id;
      } else {
        break;
      }

      // If we got fewer messages than requested, we've reached the end
      if (messages.length < remaining) {
        console.log('   📭 Reached end of channel history');
        break;
      }
    }

    console.log(`✅ Sync complete: ${count} videos cached from ${scanned} messages`);

    // Download thumbnails in background (non-blocking)
    downloadThumbnails(tg, entity, thumbMessages).catch(err => {
      console.error('Thumbnail download error:', err.message);
    });

    syncState.running = false;
    syncState.result = { count, message: `Synced ${count} videos` };
    return count;
  } catch (err) {
    syncState.running = false;
    syncState.error = err.message;
    throw err;
  }
}

/**
 * Download thumbnails for videos that don't have them cached yet.
 */
async function downloadThumbnails(tg, entity, messages) {
  for (const msg of messages) {
    const thumbPath = path.join(THUMBNAILS_DIR, `${msg.id}.jpg`);

    if (fs.existsSync(thumbPath)) {
      run('UPDATE video_cache SET thumbnail_path = ? WHERE telegram_message_id = ?', [thumbPath, msg.id]);
      continue;
    }

    try {
      const media = msg.video || msg.document;
      if (media && media.thumbs && media.thumbs.length > 0) {
        const buffer = await tg.downloadMedia(msg, {
          thumb: media.thumbs[media.thumbs.length - 1],
        });

        if (buffer) {
          fs.writeFileSync(thumbPath, buffer);
          run('UPDATE video_cache SET thumbnail_path = ? WHERE telegram_message_id = ?', [thumbPath, msg.id]);
        }
      }
    } catch (err) {
      console.error(`Failed to download thumbnail for message ${msg.id}:`, err.message);
    }
  }
}

/**
 * Stream a video file from Telegram by message ID.
 * Supports HTTP Range requests for seeking.
 */
async function streamVideo(messageId, req, res) {
  const tg = getClient();
  const channelId = process.env.TELEGRAM_CHANNEL_ID;

  let entity;
  if (/^-?\d+$/.test(channelId)) {
    entity = await tg.getEntity(BigInt(channelId));
  } else {
    entity = await tg.getEntity(channelId);
  }

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

  // Chunk size must be a power of 2, max 1MB. Offset must be divisible by chunk size.
  const CHUNK_SIZE = 1024 * 1024; // 1MB
  const targetEnd = end + 1;

  // Align the starting offset down to the nearest chunk boundary
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

      // For the first chunk, skip bytes before the requested start
      if (isFirstChunk && start > alignedStart) {
        data = data.subarray(start - alignedStart);
        isFirstChunk = false;
      }

      // Trim the last chunk if we got more than needed
      const bytesWrittenSoFar = currentOffset + (isFirstChunk ? 0 : (start - alignedStart)) ;
      const endOfThisChunk = currentOffset + result.bytes.length;
      if (endOfThisChunk > targetEnd) {
        const excess = endOfThisChunk - targetEnd;
        data = data.subarray(0, data.length - excess);
      }

      if (data.length > 0) {
        const canWrite = res.write(data);

        // Handle backpressure
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
    if (attr.className === 'DocumentAttributeVideo' && attr.duration) {
      return attr.duration;
    }
  }
  return null;
}

function getVideoWidth(attributes) {
  if (!attributes) return null;
  for (const attr of attributes) {
    if (attr.className === 'DocumentAttributeVideo' && attr.w) {
      return attr.w;
    }
  }
  return null;
}

function getVideoHeight(attributes) {
  if (!attributes) return null;
  for (const attr of attributes) {
    if (attr.className === 'DocumentAttributeVideo' && attr.h) {
      return attr.h;
    }
  }
  return null;
}

module.exports = {
  initTelegramClient,
  closeTelegramClient,
  getClient,
  getSyncState,
  refreshVideoCache,
  streamVideo,
};
