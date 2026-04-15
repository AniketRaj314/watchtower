const { Router } = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const db = require('../db');
const { validateTimestamp } = require('../middleware/timestamp');
const { applyParsedTimestamps } = require('../lib/naturalTime');

const router = Router();

const SYSTEM_PROMPT = `You are a health log parser. The user will send a short natural language string describing a meal, a blood glucose reading, an exercise session, or a combination. Parse it and return ONLY valid JSON with no markdown, no explanation, no extra text.

Return this exact structure:
{
  "entry_type": "meal" | "reading" | "exercise" | "both" | "meal+exercise" | "reading+exercise" | "all",
  "meal": {
    "meal_type": "breakfast" | "lunch" | "dinner" | "snack" | null,
    "description": "string or null",
    "medication_taken": true | false | null,
    "timestamp": "ISO-8601 string or null"
  },
  "reading": {
    "reading_type": "fasting" | "post-meal" | "pre-meal" | "random" | "bedtime" | null,
    "bg_value": number | null,
    "timestamp": "ISO-8601 string or null"
  },
  "exercise": {
    "activity": "string or null",
    "duration_minutes": number | null,
    "timestamp": "ISO-8601 string or null"
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
- For meal description, extract the food items only (not the reading, medication, or exercise info)
- Exercise examples: "30 min walk" → activity: "walk", duration_minutes: 30. "gym 45 minutes" → activity: "gym", duration_minutes: 45. "badminton 1 hour this evening" → activity: "badminton", duration_minutes: 60. "went for a 20 minute run" → activity: "run", duration_minutes: 20. "did yoga for half an hour" → activity: "yoga", duration_minutes: 30
- Convert duration phrases: "1 hour" → 60, "half an hour" / "30 min" → 30, "90 min" / "1.5 hours" → 90
- If only exercise is mentioned → entry_type: "exercise"
- If a meal and exercise are both mentioned → entry_type: "meal+exercise"
- If a reading and exercise are both mentioned → entry_type: "reading+exercise"
- If meal, reading, and exercise are all mentioned → entry_type: "all"
- If a meal and reading (no exercise) → entry_type: "both"
- If a clock time is clearly mentioned for an entry, set that entry's timestamp
- If a relative phrase is used (for example "2 hours later"), resolve it from the nearest earlier explicit time in the same sentence
- If no time is mentioned for an entry, set its timestamp to null
- For fields not mentioned, set them to null
- Return ONLY the JSON object, nothing else`;

router.post('/', async (req, res) => {
  const { text, timestamp, preview } = req.body;

  let ts = null;
  if (timestamp) {
    const tsResult = validateTimestamp(timestamp);
    if (!tsResult.valid) return res.status(400).json({ signal: 'lost', error: tsResult.error });
    ts = tsResult.value;
  }

  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ signal: 'lost', error: 'text is required' });
  }

  let parsed;
  const cleanText = text.trim();
  try {
    const client = new Anthropic();
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: cleanText }],
    });

    const raw = message.content[0].text;
    console.log('[natural] raw LLM response:', raw);
    const cleaned = raw.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim();
    parsed = JSON.parse(cleaned);
  } catch (err) {
    return res.status(500).json({ signal: 'lost', error: 'Failed to parse input: ' + err.message });
  }

  try {
    const saved = { meal: null, reading: null, exercise: null };
    let mealId = null;
    const inferredTs = applyParsedTimestamps(parsed, cleanText, { validateTimestamp });

    const wantsMeal = ['meal', 'both', 'meal+exercise', 'all'].includes(parsed.entry_type);
    const wantsReading = ['reading', 'both', 'reading+exercise', 'all'].includes(parsed.entry_type);
    const wantsExercise = ['exercise', 'meal+exercise', 'reading+exercise', 'all'].includes(parsed.entry_type);

    const hasMeal = wantsMeal
      && !!(parsed.meal && parsed.meal.meal_type && parsed.meal.description);
    const hasReading = wantsReading
      && !!(parsed.reading && parsed.reading.reading_type && parsed.reading.bg_value != null);
    const hasExercise = wantsExercise
      && !!(parsed.exercise && parsed.exercise.activity && parsed.exercise.duration_minutes != null);

    if (!hasMeal && !hasReading && !hasExercise) {
      return res.status(422).json({ signal: 'lost', error: 'Could not parse input' });
    }

    if (preview) {
      return res.status(200).json({
        signal: 'parsed',
        parsed,
        inferred_timestamps: inferredTs,
        parsed_flags: { hasMeal, hasReading, hasExercise },
      });
    }

    if (wantsMeal && !hasMeal) {
      return res.status(500).json({ signal: 'lost', error: 'Parser returned incomplete meal data' });
    }
    if (wantsReading && !hasReading) {
      return res.status(500).json({ signal: 'lost', error: 'Parser returned incomplete reading data' });
    }
    if (wantsExercise && !hasExercise) {
      return res.status(500).json({ signal: 'lost', error: 'Parser returned incomplete exercise data' });
    }

    if (hasMeal) {
      const m = parsed.meal;
      const mealTs = m.timestamp || ts;

      let medication_snapshot = null;
      const medTaken = m.medication_taken === true ? 1 : 0;
      if (medTaken) {
        const scheduleIndex = { breakfast: 0, lunch: 1, dinner: 2 };
        const idx = scheduleIndex[m.meal_type];
        if (idx !== undefined) {
          const meds = db.prepare('SELECT name, schedule FROM medications WHERE is_active = 1').all();
          const filtered = meds.filter(med => {
            const parts = (med.schedule || '1-1-1').split('-');
            return parts[idx] === '1';
          });
          medication_snapshot = filtered.map(med => med.name).join(', ') || null;
        }
      }

      const mealStmt = mealTs
        ? db.prepare(`INSERT INTO meals (timestamp, meal_type, description, medication_taken, medication_snapshot, raw_input) VALUES (?, ?, ?, ?, ?, ?)`)
        : db.prepare(`INSERT INTO meals (meal_type, description, medication_taken, medication_snapshot, raw_input) VALUES (?, ?, ?, ?, ?)`);
      const mealArgs = mealTs
        ? [mealTs, m.meal_type, m.description, medTaken, medication_snapshot, text]
        : [m.meal_type, m.description, medTaken, medication_snapshot, text];
      const result = mealStmt.run(...mealArgs);

      mealId = result.lastInsertRowid;
      saved.meal = db.prepare('SELECT * FROM meals WHERE id = ?').get(mealId);
    }

    if (hasReading) {
      const r = parsed.reading;
      const readingTs = r.timestamp || ts;

      const readStmt = readingTs
        ? db.prepare(`INSERT INTO readings (timestamp, reading_type, bg_value, meal_id, raw_input) VALUES (?, ?, ?, ?, ?)`)
        : db.prepare(`INSERT INTO readings (reading_type, bg_value, meal_id, raw_input) VALUES (?, ?, ?, ?)`);
      const readArgs = readingTs
        ? [readingTs, r.reading_type, r.bg_value, mealId, text]
        : [r.reading_type, r.bg_value, mealId, text];
      const result = readStmt.run(...readArgs);

      saved.reading = db.prepare('SELECT * FROM readings WHERE id = ?').get(result.lastInsertRowid);
    }

    if (hasExercise) {
      const ex = parsed.exercise;
      const exerciseTs = ex.timestamp || ts;

      const exStmt = exerciseTs
        ? db.prepare('INSERT INTO exercises (timestamp, activity, duration_minutes, raw_input) VALUES (?, ?, ?, ?)')
        : db.prepare('INSERT INTO exercises (activity, duration_minutes, raw_input) VALUES (?, ?, ?)');
      const exArgs = exerciseTs
        ? [exerciseTs, ex.activity, Math.round(ex.duration_minutes), text]
        : [ex.activity, Math.round(ex.duration_minutes), text];
      const result = exStmt.run(...exArgs);

      saved.exercise = db.prepare('SELECT * FROM exercises WHERE id = ?').get(result.lastInsertRowid);
    }

    res.status(201).json({ signal: 'received', saved });
  } catch (err) {
    res.status(500).json({ signal: 'lost', error: 'Failed to save: ' + err.message });
  }
});

module.exports = router;
