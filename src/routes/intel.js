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

// GET /api/intel/digests/:id
router.get('/digests/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM daily_insights WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Digest not found' });
  res.json(row);
});

// PATCH /api/intel/digests/:id
router.patch('/digests/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM daily_insights WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Digest not found' });

  const allowed = ['summary', 'best_meal', 'worst_meal', 'fasting_avg', 'post_meal_avg', 'overall_rating', 'extra_json'];
  const updates = [];
  const values = [];

  for (const field of allowed) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(req.body[field]);
    }
  }

  if (updates.length === 0) return res.status(400).json({ error: 'No valid fields to update' });

  values.push(req.params.id);
  db.prepare(`UPDATE daily_insights SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  const updated = db.prepare('SELECT * FROM daily_insights WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// DELETE /api/intel/digests/:id
router.delete('/digests/:id', (req, res) => {
  const result = db.prepare('DELETE FROM daily_insights WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Digest not found' });
  res.json({ deleted: true });
});

module.exports = router;
