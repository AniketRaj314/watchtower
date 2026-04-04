const { Router } = require('express');
const { generateDailyDigest } = require('../digest');
const { generateRecommendation } = require('../recommendation');
const db = require('../db');

const router = Router();

// POST /api/intel/generate-digest
router.post('/generate-digest', async (req, res) => {
  let { date } = req.body || {};

  if (!date) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    date = yesterday.toISOString().slice(0, 10);
  }

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
  }

  try {
    const result = await generateDailyDigest(date);
    res.json(result);
  } catch (err) {
    console.error('[intel] digest generation failed:', err.message);
    res.status(500).json({ error: 'Digest generation failed: ' + err.message });
  }
});

// POST /api/intel/recommendation
// Body: { current_time?: "HH:MM", refresh?: true } — refresh skips the 30m server cache
router.post('/recommendation', async (req, res) => {
  const { current_time, refresh } = req.body || {};

  if (current_time && !/^\d{2}:\d{2}$/.test(current_time)) {
    return res.status(400).json({ error: 'current_time must be HH:MM (24hr)' });
  }

  try {
    const result = await generateRecommendation(current_time || null, !!refresh);
    res.json(result);
  } catch (err) {
    console.error('[intel] recommendation failed:', err.message);
    res.status(500).json({ error: 'Recommendation generation failed: ' + err.message });
  }
});

// GET /api/intel/digests?days=14
router.get('/digests', (req, res) => {
  let days = parseInt(req.query.days, 10);
  if (isNaN(days) || days < 1) days = 14;
  if (days > 30) days = 30;

  const rows = db.prepare(
    "SELECT * FROM daily_insights ORDER BY date DESC LIMIT ?"
  ).all(days);

  res.json(rows);
});

module.exports = router;
