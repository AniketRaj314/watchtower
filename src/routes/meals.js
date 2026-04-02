const { Router } = require('express');
const db = require('../db');
const { validateTimestamp } = require('../middleware/timestamp');

const router = Router();

router.post('/', (req, res) => {
  const { meal_type, description, medication_taken, raw_input, timestamp } = req.body;

  if (!meal_type || !description) {
    return res.status(400).json({ error: 'meal_type and description are required' });
  }

  let ts = null;
  if (timestamp) {
    const result = validateTimestamp(timestamp);
    if (!result.valid) return res.status(400).json({ error: result.error });
    ts = result.value;
  }

  let medication_snapshot = null;
  if (medication_taken) {
    const meds = db.prepare('SELECT name FROM medications WHERE is_active = 1').all();
    medication_snapshot = meds.map(m => m.name).join(', ') || null;
  }

  const stmt = ts
    ? db.prepare(`INSERT INTO meals (timestamp, meal_type, description, medication_taken, medication_snapshot, raw_input) VALUES (?, ?, ?, ?, ?, ?)`)
    : db.prepare(`INSERT INTO meals (meal_type, description, medication_taken, medication_snapshot, raw_input) VALUES (?, ?, ?, ?, ?)`);

  const args = ts
    ? [ts, meal_type, description, medication_taken ? 1 : 0, medication_snapshot, raw_input || null]
    : [meal_type, description, medication_taken ? 1 : 0, medication_snapshot, raw_input || null];

  const result = stmt.run(...args);

  const meal = db.prepare('SELECT * FROM meals WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(meal);
});

router.get('/', (req, res) => {
  const meals = db.prepare('SELECT * FROM meals ORDER BY timestamp DESC').all();
  res.json(meals);
});

router.get('/today', (req, res) => {
  const meals = db.prepare(
    "SELECT * FROM meals WHERE date(timestamp) = date('now') ORDER BY timestamp DESC"
  ).all();
  res.json(meals);
});

router.delete('/:id', (req, res) => {
  const id = req.params.id;
  const meal = db.prepare('SELECT id FROM meals WHERE id = ?').get(id);
  if (!meal) {
    return res.status(404).json({ error: 'Meal not found' });
  }
  db.prepare('UPDATE readings SET meal_id = NULL WHERE meal_id = ?').run(id);
  db.prepare('DELETE FROM meals WHERE id = ?').run(id);
  res.json({ deleted: true });
});

module.exports = router;
