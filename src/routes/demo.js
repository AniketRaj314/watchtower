const { Router } = require('express');
const fs = require('fs');
const path = require('path');

const datasetPath = path.join(__dirname, '..', 'demo', 'demo-dataset.json');

function loadDataset() {
  const raw = fs.readFileSync(datasetPath, 'utf8');
  return JSON.parse(raw);
}

function datePart(ts) {
  if (ts == null) return '';
  const m = String(ts).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

const router = Router();

router.get('/readings', (req, res) => {
  try {
    const { readings } = loadDataset();
    const sorted = [...readings].sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
    res.json(sorted);
  } catch (e) {
    res.status(500).json({ error: 'Demo data unavailable' });
  }
});

router.get('/meals', (req, res) => {
  try {
    const { meals } = loadDataset();
    const sorted = [...meals].sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
    res.json(sorted);
  } catch (e) {
    res.status(500).json({ error: 'Demo data unavailable' });
  }
});

router.get('/medications', (req, res) => {
  try {
    const { medications: meds } = loadDataset();
    res.json(meds);
  } catch (e) {
    res.status(500).json({ error: 'Demo data unavailable' });
  }
});

router.get('/day/:date', (req, res) => {
  const { date } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Date must be YYYY-MM-DD' });
  }
  try {
    const { meals, readings } = loadDataset();
    const dayMeals = meals
      .filter((m) => datePart(m.timestamp) === date)
      .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
    const dayReadings = readings
      .filter((r) => datePart(r.timestamp) === date)
      .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
    res.json({ meals: dayMeals, readings: dayReadings });
  } catch (e) {
    res.status(500).json({ error: 'Demo data unavailable' });
  }
});

module.exports = router;
