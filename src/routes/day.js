const { Router } = require('express');
const db = require('../db');

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

router.get('/:date', (req, res) => {
  const { date } = req.params;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Date must be YYYY-MM-DD' });
  }

  const meals = db.prepare(
    "SELECT * FROM meals WHERE date(timestamp) = ? ORDER BY timestamp ASC"
  ).all(date);

  const rawReadings = db.prepare(
    "SELECT * FROM readings WHERE date(timestamp) = ? ORDER BY timestamp ASC"
  ).all(date);

  const exercises = db.prepare(
    "SELECT * FROM exercises WHERE date(timestamp) = ? ORDER BY timestamp ASC"
  ).all(date);

  res.json({ meals, readings: enrichReadings(rawReadings), exercises });
});

module.exports = router;
