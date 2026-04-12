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
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 24;
    const sort = req.query.sort || 'newest';
    const offset = (page - 1) * limit;

    let orderClause = 'telegram_message_id DESC';
    if (sort === 'oldest') orderClause = 'telegram_message_id ASC';
    else if (sort === 'size_desc') orderClause = 'file_size DESC';
    else if (sort === 'size_asc') orderClause = 'file_size ASC';
    else if (sort === 'duration_desc') orderClause = 'duration DESC';

    const countRow = get('SELECT COUNT(*) as total FROM video_cache');
    const total = countRow ? countRow.total : 0;
    const totalPages = Math.ceil(total / limit);

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
      ORDER BY ${orderClause}
      LIMIT ? OFFSET ?
    `, [limit, offset]);

    const videosWithUrls = videos.map((v) => ({
      ...v,
      thumbnail: v.thumbnail_path ? `/api/videos/${v.id}/thumbnail` : null,
      thumbnail_path: undefined,
    }));

    res.json({
      videos: videosWithUrls,
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    });
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
    const count = await refreshVideoCache({ limit: 500 });
    res.json({ message: `Refreshed ${count} newest videos from channel` });
  } catch (err) {
    console.error('Refresh error:', err);
    res.status(500).json({ error: 'Failed to refresh video cache: ' + err.message });
  }
});

/**
 * POST /api/videos/refresh-older
 * Loads the next 500 oldest videos.
 */
router.post('/refresh-older', authenticate, async (req, res) => {
  try {
    const row = get('SELECT MIN(telegram_message_id) as min_id FROM video_cache');
    const minId = row && row.min_id ? row.min_id : 0;
    
    if (minId === 0) {
      return res.status(400).json({ error: 'No cached videos to find history for' });
    }

    const count = await refreshVideoCache({ limit: 500, offsetId: minId });
    res.json({ message: `Fetched ${count} historically older videos from channel` });
  } catch (err) {
    console.error('Refresh older error:', err);
    res.status(500).json({ error: 'Failed to fetch older videos: ' + err.message });
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

/**
 * GET /api/videos/:id/info
 * Get metadata for a specific video
 */
router.get('/:id/info', authenticate, (req, res) => {
  try {
    const video = get(`
      SELECT
        telegram_message_id as id, title, description, duration,
        file_size, mime_type, width, height, cached_at
      FROM video_cache
      WHERE telegram_message_id = ?
    `, [parseInt(req.params.id)]);

    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    res.json({ video });
  } catch (err) {
    console.error('Video info error:', err);
    res.status(500).json({ error: 'Failed to load video info' });
  }
});

module.exports = router;
