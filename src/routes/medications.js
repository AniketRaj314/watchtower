const { Router } = require('express');
const db = require('../db');

const router = Router();

router.get('/', (req, res) => {
  const meds = db.prepare('SELECT * FROM medications').all();
  res.json(meds);
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

module.exports = router;
