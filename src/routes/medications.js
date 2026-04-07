const { Router } = require('express');
const db = require('../db');

const router = Router();

router.post('/', (req, res) => {
  const { name, dose, frequency, schedule, is_default, is_active, notes } = req.body;

  if (!name || !dose || !frequency) {
    return res.status(400).json({ error: 'name, dose, and frequency are required' });
  }

  const result = db.prepare(
    `INSERT INTO medications (name, dose, frequency, schedule, is_default, is_active, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    name,
    dose,
    frequency,
    schedule || '1-1-1',
    is_default !== undefined ? (is_default ? 1 : 0) : 0,
    is_active !== undefined ? (is_active ? 1 : 0) : 1,
    notes || null
  );

  const med = db.prepare('SELECT * FROM medications WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(med);
});

router.get('/', (req, res) => {
  const meds = db.prepare('SELECT * FROM medications').all();
  res.json(meds);
});

router.get('/:id', (req, res) => {
  const med = db.prepare('SELECT * FROM medications WHERE id = ?').get(req.params.id);
  if (!med) return res.status(404).json({ error: 'Medication not found' });
  res.json(med);
});

router.patch('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM medications WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Medication not found' });
  }

  const allowed = ['name', 'dose', 'frequency', 'schedule', 'is_default', 'is_active', 'notes'];
  const updates = [];
  const values = [];

  for (const field of allowed) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(req.body[field]);
    }
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  values.push(req.params.id);
  db.prepare(`UPDATE medications SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  const updated = db.prepare('SELECT * FROM medications WHERE id = ?').get(req.params.id);
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const med = db.prepare('SELECT id FROM medications WHERE id = ?').get(req.params.id);
  if (!med) return res.status(404).json({ error: 'Medication not found' });
  db.prepare('DELETE FROM medications WHERE id = ?').run(req.params.id);
  res.json({ deleted: true });
});

module.exports = router;
