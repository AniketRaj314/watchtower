const { Router } = require('express');
const db = require('../db');

const router = Router();

router.post('/', (req, res) => {
  const { food_name, pattern, evidence } = req.body;

  if (!food_name || !pattern || !evidence) {
    return res.status(400).json({ error: 'food_name, pattern, and evidence are required' });
  }

  const existing = db.prepare('SELECT id FROM food_insights WHERE food_name = ?').get(food_name);
  if (existing) {
    return res.status(409).json({ error: 'food_name already exists; use PATCH to update' });
  }

  const result = db.prepare(
    `INSERT INTO food_insights (food_name, pattern, evidence) VALUES (?, ?, ?)`
  ).run(food_name, pattern, evidence);

  const row = db.prepare('SELECT * FROM food_insights WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(row);
});

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM food_insights ORDER BY updated_at DESC').all();
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM food_insights WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Food insight not found' });
  res.json(row);
});

router.patch('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM food_insights WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Food insight not found' });

  const allowed = ['food_name', 'pattern', 'evidence'];
  const updates = [];
  const values = [];

  for (const field of allowed) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(req.body[field]);
    }
  }

  if (updates.length === 0) return res.status(400).json({ error: 'No valid fields to update' });

  updates.push(`updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`);
  values.push(req.params.id);
  db.prepare(`UPDATE food_insights SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  const updated = db.prepare('SELECT * FROM food_insights WHERE id = ?').get(req.params.id);
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM food_insights WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Food insight not found' });
  res.json({ deleted: true });
});

module.exports = router;
