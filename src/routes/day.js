const { Router } = require('express');
const db = require('../db');

const router = Router();

router.get('/:date', (req, res) => {
  const { date } = req.params;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Date must be YYYY-MM-DD' });
  }

  const meals = db.prepare(
    "SELECT * FROM meals WHERE date(timestamp) = ? ORDER BY timestamp ASC"
  ).all(date);

  const readings = db.prepare(
    "SELECT * FROM readings WHERE date(timestamp) = ? ORDER BY timestamp ASC"
  ).all(date);

  res.json({ meals, readings });
});

module.exports = router;
