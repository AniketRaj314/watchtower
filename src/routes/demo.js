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

// Rebase all timestamps so the latest day in the dataset maps to today
function rebaseTimestamps(items) {
  if (!items.length) return items;

  // Find the latest date in the dataset
  const dates = items.map(i => datePart(i.timestamp)).filter(Boolean).sort();
  const latestDate = dates[dates.length - 1];

  const latestMs = new Date(latestDate + 'T00:00:00Z').getTime();
  const todayMs = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime();
  const offsetMs = todayMs - latestMs;

  if (offsetMs === 0) return items;

  return items.map(item => {
    if (!item.timestamp) return item;
    const shifted = new Date(new Date(item.timestamp).getTime() + offsetMs);
    return { ...item, timestamp: shifted.toISOString().replace('.000Z', 'Z') };
  });
}

const router = Router();

router.get('/readings', (req, res) => {
  try {
    const { readings } = loadDataset();
    const rebased = rebaseTimestamps(readings);
    const sorted = [...rebased].sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
    res.json(sorted);
  } catch (e) {
    res.status(500).json({ error: 'Demo data unavailable' });
  }
});

router.get('/meals', (req, res) => {
  try {
    const { meals } = loadDataset();
    const rebased = rebaseTimestamps(meals);
    const sorted = [...rebased].sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
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
    const rebasedMeals = rebaseTimestamps(meals);
    const rebasedReadings = rebaseTimestamps(readings);
    const dayMeals = rebasedMeals
      .filter((m) => datePart(m.timestamp) === date)
      .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
    const dayReadings = rebasedReadings
      .filter((r) => datePart(r.timestamp) === date)
      .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
    res.json({ meals: dayMeals, readings: dayReadings });
  } catch (e) {
    res.status(500).json({ error: 'Demo data unavailable' });
  }
});

module.exports = router;
