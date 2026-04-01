const { Router } = require('express');
const db = require('../db');

const router = Router();

router.post('/', (req, res) => {
  const { reading_type, bg_value, meal_id, raw_input } = req.body;

  if (!reading_type || bg_value == null) {
    return res.status(400).json({ error: 'reading_type and bg_value are required' });
  }

  if (meal_id) {
    const meal = db.prepare('SELECT id FROM meals WHERE id = ?').get(meal_id);
    if (!meal) {
      return res.status(400).json({ error: 'Invalid meal_id' });
    }
  }

  const stmt = db.prepare(
    `INSERT INTO readings (reading_type, bg_value, meal_id, raw_input)
     VALUES (?, ?, ?, ?)`
  );
  const result = stmt.run(reading_type, bg_value, meal_id || null, raw_input || null);

  const reading = db.prepare('SELECT * FROM readings WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(reading);
});

router.get('/', (req, res) => {
  const readings = db.prepare('SELECT * FROM readings ORDER BY timestamp DESC').all();
  res.json(readings);
});

router.get('/today', (req, res) => {
  const readings = db.prepare(
    "SELECT * FROM readings WHERE date(timestamp) = date('now') ORDER BY timestamp DESC"
  ).all();
  res.json(readings);
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM readings WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Reading not found' });
  }
  res.json({ deleted: true });
});

module.exports = router;
