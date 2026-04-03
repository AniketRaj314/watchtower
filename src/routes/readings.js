const { Router } = require('express');
const db = require('../db');
const { validateTimestamp } = require('../middleware/timestamp');

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

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM readings WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Reading not found' });
  }
  res.json({ deleted: true });
});

module.exports = router;
