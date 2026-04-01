const { Router } = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const db = require('../db');

const router = Router();

const SYSTEM_PROMPT = `You are a health log parser. The user will send a short natural language string describing a meal, a blood glucose reading, or both. Parse it and return ONLY valid JSON with no markdown, no explanation, no extra text.

Return this exact structure:
{
  "entry_type": "meal" | "reading" | "both",
  "meal": {
    "meal_type": "breakfast" | "lunch" | "dinner" | "snack" | null,
    "description": "string or null",
    "medication_taken": true | false | null
  },
  "reading": {
    "reading_type": "fasting" | "post-meal" | "pre-meal" | "random" | "bedtime" | null,
    "bg_value": number | null
  }
}

Rules:
- "took meds" / "took my meds" / "with meds" → medication_taken: true
- "no meds" / "skipped meds" → medication_taken: false
- If medication not mentioned at all → medication_taken: null
- "fasting 118" means a fasting reading with bg_value 118, entry_type "reading"
- "post meal 156 had dal chawal for lunch" means both a post-meal reading (bg_value 156) and a lunch meal, entry_type "both"
- "pre meal 134 before dinner" means a pre-meal reading only, entry_type "reading"
- "bedtime 134" means a bedtime reading, entry_type "reading"
- "random 142" means a random reading, entry_type "reading"
- Numbers that appear alongside reading type keywords (fasting, post-meal, pre-meal, random, bedtime) are bg_value in mg/dL
- For meal description, extract the food items only (not the reading or medication info)
- If there is a meal mentioned along with a reading, entry_type must be "both"
- Return ONLY the JSON object, nothing else`;

router.post('/', async (req, res) => {
  const { text } = req.body;

  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ signal: 'lost', error: 'text is required' });
  }

  let parsed;
  try {
    const client = new Anthropic();
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: text.trim() }],
    });

    const raw = message.content[0].text;
    console.log('[natural] raw LLM response:', raw);
    const cleaned = raw.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim();
    parsed = JSON.parse(cleaned);
  } catch (err) {
    return res.status(500).json({ signal: 'lost', error: 'Failed to parse input: ' + err.message });
  }

  try {
    const saved = { meal: null, reading: null };
    let mealId = null;

    if (parsed.entry_type === 'meal' || parsed.entry_type === 'both') {
      const m = parsed.meal;
      if (!m || !m.meal_type || !m.description) {
        return res.status(500).json({ signal: 'lost', error: 'Parser returned incomplete meal data' });
      }

      let medication_snapshot = null;
      const medTaken = m.medication_taken === true ? 1 : 0;
      if (medTaken) {
        const meds = db.prepare('SELECT name FROM medications WHERE is_active = 1').all();
        medication_snapshot = meds.map(med => med.name).join(', ') || null;
      }

      const result = db.prepare(
        `INSERT INTO meals (meal_type, description, medication_taken, medication_snapshot, raw_input)
         VALUES (?, ?, ?, ?, ?)`
      ).run(m.meal_type, m.description, medTaken, medication_snapshot, text);

      mealId = result.lastInsertRowid;
      saved.meal = db.prepare('SELECT * FROM meals WHERE id = ?').get(mealId);
    }

    if (parsed.entry_type === 'reading' || parsed.entry_type === 'both') {
      const r = parsed.reading;
      if (!r || !r.reading_type || r.bg_value == null) {
        return res.status(500).json({ signal: 'lost', error: 'Parser returned incomplete reading data' });
      }

      const result = db.prepare(
        `INSERT INTO readings (reading_type, bg_value, meal_id, raw_input)
         VALUES (?, ?, ?, ?)`
      ).run(r.reading_type, r.bg_value, mealId, text);

      saved.reading = db.prepare('SELECT * FROM readings WHERE id = ?').get(result.lastInsertRowid);
    }

    res.status(201).json({ signal: 'received', saved });
  } catch (err) {
    res.status(500).json({ signal: 'lost', error: 'Failed to save: ' + err.message });
  }
});

module.exports = router;
