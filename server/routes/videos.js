const express = require('express');
const fs = require('fs');
const { all, get } = require('../database/init');
const { authenticate } = require('../middleware/auth');
const { requireSubscription } = require('../middleware/subscription');
const { refreshVideoCache, streamVideo } = require('../services/telegram');

const router = express.Router();

/**
 * GET /api/videos
 * List all videos from the cache. Requires authentication.
 */
router.get('/', authenticate, (req, res) => {
  try {
    const videos = all(`
      SELECT
        telegram_message_id as id,
        title,
        description,
        duration,
        file_size,
        mime_type,
        width,
        height,
        thumbnail_path,
        cached_at
      FROM video_cache
      ORDER BY telegram_message_id DESC
    `);

    const videosWithUrls = videos.map((v) => ({
      ...v,
      thumbnail: v.thumbnail_path ? `/api/videos/${v.id}/thumbnail` : null,
      thumbnail_path: undefined,
    }));

    res.json({ videos: videosWithUrls });
  } catch (err) {
    console.error('List videos error:', err);
    res.status(500).json({ error: 'Failed to fetch videos' });
  }
});

/**
 * POST /api/videos/refresh
 */
router.post('/refresh', authenticate, async (req, res) => {
  try {
    const count = await refreshVideoCache();
    res.json({ message: `Refreshed ${count} videos from channel` });
  } catch (err) {
    console.error('Refresh error:', err);
    res.status(500).json({ error: 'Failed to refresh video cache: ' + err.message });
  }
});

/**
 * GET /api/videos/:id/stream
 */
router.get('/:id/stream', authenticate, requireSubscription, async (req, res) => {
  try {
    const messageId = req.params.id;

    const video = get('SELECT * FROM video_cache WHERE telegram_message_id = ?', [parseInt(messageId)]);

    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    await streamVideo(messageId, req, res);
  } catch (err) {
    console.error('Stream error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Streaming failed' });
    }
  }
});

/**
 * GET /api/videos/:id/thumbnail
 */
router.get('/:id/thumbnail', (req, res) => {
  try {
    const video = get(
      'SELECT thumbnail_path FROM video_cache WHERE telegram_message_id = ?',
      [parseInt(req.params.id)]
    );

    if (!video || !video.thumbnail_path || !fs.existsSync(video.thumbnail_path)) {
      return res.status(404).json({ error: 'Thumbnail not found' });
    }

    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    fs.createReadStream(video.thumbnail_path).pipe(res);
  } catch (err) {
    console.error('Thumbnail error:', err);
    res.status(500).json({ error: 'Failed to load thumbnail' });
  }
});

module.exports = router;
