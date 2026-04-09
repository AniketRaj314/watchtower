const { Router } = require('express');
const db = require('../db');
const { validateTimestamp } = require('../middleware/timestamp');
const { invalidateCache } = require('../recommendation');

const router = Router();

router.post('/', (req, res) => {
  const { activity, duration_minutes, notes, raw_input, timestamp } = req.body;

  if (!activity || typeof activity !== 'string' || !activity.trim()) {
    return res.status(400).json({ error: 'activity is required' });
  }
  const duration = Number(duration_minutes);
  if (!Number.isFinite(duration) || duration <= 0) {
    return res.status(400).json({ error: 'duration_minutes must be a positive number' });
  }

  let ts = null;
  if (timestamp) {
    const result = validateTimestamp(timestamp);
    if (!result.valid) return res.status(400).json({ error: result.error });
    ts = result.value;
  }

  const stmt = ts
    ? db.prepare('INSERT INTO exercises (timestamp, activity, duration_minutes, notes, raw_input) VALUES (?, ?, ?, ?, ?)')
    : db.prepare('INSERT INTO exercises (activity, duration_minutes, notes, raw_input) VALUES (?, ?, ?, ?)');

  const args = ts
    ? [ts, activity.trim(), Math.round(duration), notes || null, raw_input || null]
    : [activity.trim(), Math.round(duration), notes || null, raw_input || null];

  const result = stmt.run(...args);
  const exercise = db.prepare('SELECT * FROM exercises WHERE id = ?').get(result.lastInsertRowid);
  invalidateCache();
  res.status(201).json(exercise);
});

router.get('/', (req, res) => {
  const exercises = db.prepare('SELECT * FROM exercises ORDER BY timestamp DESC').all();
  res.json(exercises);
});

router.get('/today', (req, res) => {
  const exercises = db.prepare(
    "SELECT * FROM exercises WHERE date(timestamp) = date('now') ORDER BY timestamp DESC"
  ).all();
  res.json(exercises);
});

router.get('/:id', (req, res) => {
  const exercise = db.prepare('SELECT * FROM exercises WHERE id = ?').get(req.params.id);
  if (!exercise) return res.status(404).json({ error: 'Exercise not found' });
  res.json(exercise);
});

router.patch('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM exercises WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Exercise not found' });

  const allowed = ['activity', 'duration_minutes', 'notes', 'raw_input', 'timestamp'];
  const updates = [];
  const values = [];

  for (const field of allowed) {
    if (req.body[field] !== undefined) {
      if (field === 'timestamp') {
        const result = validateTimestamp(req.body[field]);
        if (!result.valid) return res.status(400).json({ error: result.error });
        updates.push('timestamp = ?');
        values.push(result.value);
      } else if (field === 'duration_minutes') {
        const n = Number(req.body[field]);
        if (!Number.isFinite(n) || n <= 0) {
          return res.status(400).json({ error: 'duration_minutes must be a positive number' });
        }
        updates.push('duration_minutes = ?');
        values.push(Math.round(n));
      } else {
        updates.push(`${field} = ?`);
        values.push(req.body[field]);
      }
    }
  }

  if (updates.length === 0) return res.status(400).json({ error: 'No valid fields to update' });

  values.push(req.params.id);
  db.prepare(`UPDATE exercises SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  const updated = db.prepare('SELECT * FROM exercises WHERE id = ?').get(req.params.id);
  invalidateCache();
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const id = req.params.id;
  const exercise = db.prepare('SELECT id FROM exercises WHERE id = ?').get(id);
  if (!exercise) {
    return res.status(404).json({ error: 'Exercise not found' });
  }
  db.prepare('DELETE FROM exercises WHERE id = ?').run(id);
  invalidateCache();
  res.json({ deleted: true });
});

module.exports = router;
