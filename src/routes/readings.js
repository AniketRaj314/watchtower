const { Router } = require('express');
const db = require('../db');
const { validateTimestamp } = require('../middleware/timestamp');
const { invalidateCache } = require('../recommendation');

const router = Router();

function enrichReadings(rows) {
  const getMeal = db.prepare('SELECT id, meal_type, timestamp, description FROM meals WHERE id = ?');
  return rows.map(r => {
    const ids = r.meal_ids ? r.meal_ids.split(',').map(Number) : [];
    const meals = ids.length
      ? ids.map(id => getMeal.get(id)).filter(Boolean)
      : [];
    return { ...r, meal_ids: meals };
  });
}

router.post('/', (req, res) => {
  const { reading_type, bg_value, meal_ids: rawMealIds, raw_input, timestamp } = req.body;

  if (!reading_type || bg_value == null) {
    return res.status(400).json({ error: 'reading_type and bg_value are required' });
  }

  let ts = null;
  if (timestamp) {
    const result = validateTimestamp(timestamp);
    if (!result.valid) return res.status(400).json({ error: result.error });
    ts = result.value;
  }

  let mealIdsStr = null;
  if (Array.isArray(rawMealIds) && rawMealIds.length) {
    for (const id of rawMealIds) {
      const meal = db.prepare('SELECT id FROM meals WHERE id = ?').get(id);
      if (!meal) {
        return res.status(400).json({ error: `Invalid meal_id: ${id}` });
      }
    }
    mealIdsStr = rawMealIds.join(',');
  }

  const stmt = ts
    ? db.prepare(`INSERT INTO readings (timestamp, reading_type, bg_value, meal_ids, raw_input) VALUES (?, ?, ?, ?, ?)`)
    : db.prepare(`INSERT INTO readings (reading_type, bg_value, meal_ids, raw_input) VALUES (?, ?, ?, ?)`);

  const args = ts
    ? [ts, reading_type, bg_value, mealIdsStr, raw_input || null]
    : [reading_type, bg_value, mealIdsStr, raw_input || null];

  const result = stmt.run(...args);

  const row = db.prepare('SELECT * FROM readings WHERE id = ?').get(result.lastInsertRowid);
  invalidateCache();
  res.status(201).json(enrichReadings([row])[0]);
});

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM readings ORDER BY timestamp DESC').all();
  res.json(enrichReadings(rows));
});

router.get('/today', (req, res) => {
  const rows = db.prepare(
    "SELECT * FROM readings WHERE date(timestamp) = date('now') ORDER BY timestamp DESC"
  ).all();
  res.json(enrichReadings(rows));
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM readings WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Reading not found' });
  res.json(enrichReadings([row])[0]);
});

router.patch('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM readings WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Reading not found' });

  const updates = [];
  const values = [];

  if (req.body.reading_type !== undefined) {
    updates.push('reading_type = ?');
    values.push(req.body.reading_type);
  }
  if (req.body.bg_value !== undefined) {
    updates.push('bg_value = ?');
    values.push(req.body.bg_value);
  }
  if (req.body.raw_input !== undefined) {
    updates.push('raw_input = ?');
    values.push(req.body.raw_input);
  }
  if (req.body.timestamp !== undefined) {
    const result = validateTimestamp(req.body.timestamp);
    if (!result.valid) return res.status(400).json({ error: result.error });
    updates.push('timestamp = ?');
    values.push(result.value);
  }
  if (req.body.meal_ids !== undefined) {
    if (Array.isArray(req.body.meal_ids)) {
      for (const id of req.body.meal_ids) {
        const meal = db.prepare('SELECT id FROM meals WHERE id = ?').get(id);
        if (!meal) return res.status(400).json({ error: `Invalid meal_id: ${id}` });
      }
      updates.push('meal_ids = ?');
      values.push(req.body.meal_ids.length ? req.body.meal_ids.join(',') : null);
    } else if (req.body.meal_ids === null) {
      updates.push('meal_ids = ?');
      values.push(null);
    }
  }

  if (updates.length === 0) return res.status(400).json({ error: 'No valid fields to update' });

  values.push(req.params.id);
  db.prepare(`UPDATE readings SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  const updated = db.prepare('SELECT * FROM readings WHERE id = ?').get(req.params.id);
  invalidateCache();
  res.json(enrichReadings([updated])[0]);
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM readings WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Reading not found' });
  }
  res.json({ deleted: true });
});

module.exports = router;
