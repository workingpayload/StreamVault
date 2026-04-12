const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { get, run, saveDb } = require('../database/init');
const path = require('path');
const fs = require('fs');

let client = null;
let isConnected = false;

const THUMBNAILS_DIR = path.join(__dirname, '..', '..', 'data', 'thumbnails');

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

  await client.connect();
  isConnected = true;
  console.log('✅ Telegram MTProto client connected');

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
 * Fetch all video messages from the configured Telegram channel
 * and cache their metadata in the database.
 */
async function refreshVideoCache() {
  const tg = getClient();
  const channelId = process.env.TELEGRAM_CHANNEL_ID;

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

  // Fetch messages with video content
  const messages = [];
  for await (const message of tg.iterMessages(entity, { limit: 500 })) {
    if (message.video || (message.document && message.document.mimeType && message.document.mimeType.startsWith('video/'))) {
      messages.push(message);
    }
  }

  console.log(`📹 Found ${messages.length} videos in channel`);

  for (const msg of messages) {
    const media = msg.video || msg.document;
    const caption = msg.message || '';

    const lines = caption.split('\n');
    const title = lines[0] || `Video ${msg.id}`;
    const description = lines.slice(1).join('\n').trim();

    // Check if already cached
    const existing = get('SELECT id FROM video_cache WHERE telegram_message_id = ?', [msg.id]);

    if (existing) {
      run(
        `UPDATE video_cache SET title = ?, description = ?, duration = ?, file_size = ?,
         mime_type = ?, width = ?, height = ?, cached_at = datetime('now')
         WHERE telegram_message_id = ?`,
        [
          title,
          description,
          media.attributes ? getVideoDuration(media.attributes) : null,
          media.size ? Number(media.size) : null,
          media.mimeType || 'video/mp4',
          getVideoWidth(media.attributes),
          getVideoHeight(media.attributes),
          msg.id,
        ]
      );
    } else {
      run(
        `INSERT INTO video_cache (telegram_message_id, title, description, duration, file_size, mime_type, width, height, cached_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
          msg.id,
          title,
          description,
          media.attributes ? getVideoDuration(media.attributes) : null,
          media.size ? Number(media.size) : null,
          media.mimeType || 'video/mp4',
          getVideoWidth(media.attributes),
          getVideoHeight(media.attributes),
        ]
      );
    }
  }

  saveDb();

  // Download thumbnails in background
  downloadThumbnails(tg, entity, messages).catch(err => {
    console.error('Thumbnail download error:', err.message);
  });

  return messages.length;
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

  const CHUNK_SIZE = 1024 * 1024; // 1MB chunks
  let offset = start;
  const targetEnd = end + 1;

  try {
    for await (const chunk of tg.iterDownload({
      file: fileLocation,
      offset: BigInt(offset),
      requestSize: CHUNK_SIZE,
      limit: Math.ceil((targetEnd - start) / CHUNK_SIZE),
    })) {
      if (res.destroyed) break;

      let data = Buffer.from(chunk);

      const remaining = targetEnd - offset;
      if (data.length > remaining) {
        data = data.subarray(0, remaining);
      }

      const canWrite = res.write(data);
      offset += data.length;

      if (offset >= targetEnd) break;

      if (!canWrite) {
        await new Promise((resolve) => res.once('drain', resolve));
      }
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
  getClient,
  refreshVideoCache,
  streamVideo,
};
