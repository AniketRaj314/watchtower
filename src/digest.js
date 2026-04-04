const Anthropic = require('@anthropic-ai/sdk');
const db = require('./db');

const SYSTEM_PROMPT = `You are a precise glucose pattern analyst for a pre-diabetic person (not Type 2 diabetic).
Glucose targets: fasting below 120 mg/dL, post-meal below 140 mg/dL.
This person eats Indian food daily: chapati, dal, sabzi, dahi, paneer, eggs, South Indian dishes.
Medications will be provided in the user message — use them to understand which levers are active at each meal.

Your job is NOT to summarise what happened. The UI already shows the log.
Your job is to explain WHY glucose moved the way it did, and what one specific thing should change tomorrow.
Be specific to actual foods eaten. Never give generic advice like "eat more protein" or "reduce carbs".
Name the actual food. Explain the actual mechanism.
Output only valid JSON, no markdown, no backticks.`;

function fetchMedicationLines() {
  const meds = db.prepare('SELECT name, dose, frequency, schedule, is_active FROM medications').all();
  if (!meds.length) return 'None';
  return meds.map(m => {
    const status = m.is_active ? 'active' : 'inactive';
    return `${m.name} ${m.dose} — ${m.frequency} (schedule: ${m.schedule}, ${status})`;
  }).join('\n  ');
}

function buildUserPrompt(date, meals, readings) {
  const readingLines = readings.map(r => {
    let line = `${r.reading_type}: ${r.bg_value} mg/dL`;
    // Check both legacy meal_id and newer meal_ids column
    const linkedIds = [];
    if (r.meal_id) linkedIds.push(r.meal_id);
    if (r.meal_ids) {
      for (const id of r.meal_ids.split(',').map(Number)) {
        if (id && !linkedIds.includes(id)) linkedIds.push(id);
      }
    }
    if (linkedIds.length) {
      const linkedMeals = linkedIds.map(id => meals.find(m => m.id === id)).filter(Boolean);
      if (linkedMeals.length) {
        const desc = linkedMeals.map(m => `${m.meal_type}: ${m.description}`).join('; ');
        line += ` (linked to ${desc})`;
      }
    }
    return line;
  }).join('\n  ');

  const mealLines = meals.map(m => {
    const ts = m.timestamp.endsWith('Z') ? m.timestamp : m.timestamp + 'Z';
    const time = new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    let line = `${m.meal_type} (${time}): ${m.description}`;
    if (m.medication_taken && m.medication_snapshot) {
      line += ` [meds: ${m.medication_snapshot}]`;
    }
    return line;
  }).join('\n  ');

  const medicationLines = fetchMedicationLines();

  return `Date: ${date}
Readings:
  ${readingLines || 'None'}
Meals:
  ${mealLines || 'None'}

Medications active today:
  ${medicationLines}

Targets: fasting < 120, post-meal < 140.

Analyse this day and return JSON:
{
  "summary": "2-3 sentences max. State the single most important pattern from today. Reference actual foods by name. Do not restate the log. No bullet points.",
  "why_it_spiked": "If any post-meal reading exceeded 140, explain specifically which food, what composition, or what timing caused it. If no spike, return null.",
  "tomorrow_focus": "One specific actionable change for tomorrow tied to today's actual data. Must name the actual food or meal. Not generic advice.",
  "best_meal": "meal_type with lowest post-meal spike, or null",
  "worst_meal": "meal_type with highest post-meal spike, or null",
  "fasting_avg": "number or null",
  "post_meal_avg": "number or null",
  "overall_rating": "good | moderate | poor"
}

Rating rules:
  good: post_meal_avg < 140 AND fasting_avg < 120
  poor: post_meal_avg > 180 OR fasting_avg > 140
  moderate: everything else`;
}

async function generateDailyDigest(date) {
  // Fetch readings for the date
  const readings = db.prepare(
    "SELECT * FROM readings WHERE date(timestamp) = ? ORDER BY timestamp"
  ).all(date);

  if (readings.length === 0) {
    return { skipped: true, date };
  }

  // Fetch meals for the date
  const meals = db.prepare(
    "SELECT * FROM meals WHERE date(timestamp) = ? ORDER BY timestamp"
  ).all(date);

  // Call Haiku
  const client = new Anthropic();
  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(date, meals, readings) }],
  });

  const raw = message.content[0].text;
  const cleaned = raw.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim();
  const parsed = JSON.parse(cleaned);

  const now = new Date().toISOString();
  const extraJson = JSON.stringify({
    why_it_spiked: parsed.why_it_spiked || null,
    tomorrow_focus: parsed.tomorrow_focus || null,
  });

  // Upsert — update if exists, insert if not
  const existing = db.prepare("SELECT id FROM daily_insights WHERE date = ?").get(date);
  if (existing) {
    db.prepare(`
      UPDATE daily_insights SET
        summary = ?, best_meal = ?, worst_meal = ?,
        fasting_avg = ?, post_meal_avg = ?, overall_rating = ?,
        extra_json = ?, generated_at = ?
      WHERE date = ?
    `).run(
      parsed.summary,
      parsed.best_meal || null,
      parsed.worst_meal || null,
      parsed.fasting_avg ?? null,
      parsed.post_meal_avg ?? null,
      parsed.overall_rating || 'moderate',
      extraJson,
      now,
      date
    );
  } else {
    db.prepare(`
      INSERT INTO daily_insights (date, summary, best_meal, worst_meal, fasting_avg, post_meal_avg, overall_rating, extra_json, generated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      date,
      parsed.summary,
      parsed.best_meal || null,
      parsed.worst_meal || null,
      parsed.fasting_avg ?? null,
      parsed.post_meal_avg ?? null,
      parsed.overall_rating || 'moderate',
      extraJson,
      now
    );
  }

  return db.prepare("SELECT * FROM daily_insights WHERE date = ?").get(date);
}

module.exports = { generateDailyDigest };
