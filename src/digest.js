const Anthropic = require('@anthropic-ai/sdk');
const db = require('./db');

function toIST(ts) {
  const d = new Date(ts.endsWith('Z') ? ts : ts + 'Z');
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
}

const SYSTEM_PROMPT = `You are a precise glucose pattern analyst for a pre-diabetic person (not Type 2 diabetic).
Glucose targets: fasting below 120 mg/dL, post-meal below 140 mg/dL.
This person eats Indian food daily: chapati, dal, sabzi, dahi, paneer, eggs, South Indian dishes.
Medications will be provided in the user message — use them to understand which levers are active at each meal.
When no post-meal dinner reading exists, infer dinner impact from the bedtime reading and the following morning's fasting if available. State clearly that this is an inference, not a direct reading.

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

function getMedsForMeal(mealType) {
  const scheduleIndex = { breakfast: 0, lunch: 1, dinner: 2 };
  const idx = scheduleIndex[mealType];
  if (idx === undefined) return null;
  const meds = db.prepare('SELECT name FROM medications WHERE is_active = 1').all();
  const filtered = meds.filter(m => {
    const schedule = db.prepare('SELECT schedule FROM medications WHERE name = ?').get(m.name);
    const parts = (schedule?.schedule || '1-1-1').split('-');
    return parts[idx] === '1';
  });
  return filtered.length ? filtered.map(m => m.name).join(', ') : null;
}

function buildUserPrompt(date, meals, readings) {
  // Sort meals by timestamp for time-gap calculation
  const sortedMeals = [...meals].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const readingLines = readings.map(r => {
    const rTs = new Date(r.timestamp.endsWith('Z') ? r.timestamp : r.timestamp + 'Z');
    let line = `${r.reading_type}: ${r.bg_value} mg/dL`;

    // Find the most recent meal before this reading
    let closestMeal = null;
    let gapMinutes = null;
    for (const m of sortedMeals) {
      const mTs = new Date(m.timestamp.endsWith('Z') ? m.timestamp : m.timestamp + 'Z');
      if (mTs <= rTs) {
        closestMeal = m;
        gapMinutes = Math.round((rTs - mTs) / 60000);
      }
    }

    // Check explicit links (meal_id and meal_ids columns)
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
        // Use linked meal for meds info
        const primaryMeal = linkedMeals[0];
        const meds = getMedsForMeal(primaryMeal.meal_type);
        if (meds) line += ` [meds at ${primaryMeal.meal_type}: ${meds}]`;
      }
    } else if (closestMeal && gapMinutes !== null) {
      // No explicit link — annotate with timing-based attribution
      const hours = Math.floor(gapMinutes / 60);
      const mins = gapMinutes % 60;
      const gapStr = hours > 0 ? `${hours}h${mins > 0 ? mins + 'm' : ''}` : `${mins}m`;
      line += ` (${gapStr} after ${closestMeal.meal_type}: ${closestMeal.description})`;
      const meds = getMedsForMeal(closestMeal.meal_type);
      if (meds) line += ` [meds at ${closestMeal.meal_type}: ${meds}]`;
    }

    return line;
  }).join('\n  ');

  const mealLines = meals.map(m => {
    const time = toIST(m.timestamp);
    let line = `${m.meal_type} (${time}): ${m.description}`;
    if (m.medication_taken && m.medication_snapshot) {
      line += ` [meds: ${m.medication_snapshot}]`;
    }
    return line;
  }).join('\n  ');

  const medicationLines = fetchMedicationLines();

  // Check for next morning's fasting reading
  const nextDay = new Date(date + 'T00:00:00Z');
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const nextDayStr = nextDay.toISOString().slice(0, 10);
  const nextFasting = db.prepare(
    "SELECT bg_value FROM readings WHERE date(timestamp) = ? AND reading_type = 'fasting' ORDER BY timestamp ASC LIMIT 1"
  ).get(nextDayStr);
  const nextMorningFasting = nextFasting ? `${nextFasting.bg_value} mg/dL` : 'not yet available';

  return `Date: ${date}
Readings:
  ${readingLines || 'None'}
Meals:
  ${mealLines || 'None'}

Medications active today:
  ${medicationLines}

Next morning fasting: ${nextMorningFasting}

Targets: fasting < 120, post-meal < 140.

Analyse this day and return JSON:
{
  "summary": "2-3 sentences max. State the single most important pattern from today. Reference actual foods by name. Do not restate the log. No bullet points.",
  "why_it_spiked": "If any post-meal reading exceeded 140, explain specifically which food, what composition, or what timing caused it. If no spike, return null.",
  "tomorrow_focus": "One specific actionable change for tomorrow tied to today's actual data. Must name the actual food or meal. Not generic advice.",
  "best_meal": "meal_type with lowest post-meal spike, or null",
  "worst_meal": "meal_type with highest post-meal spike, or null",
  "fasting_avg": number or null,
  "post_meal_avg": number or null,
  "overall_rating": "good | moderate | poor"
}

Rating rules:
  good: post_meal_avg < 140 AND fasting_avg < 120
  poor: post_meal_avg > 180 OR fasting_avg > 140
  moderate: everything else`;
}

async function updateFoodInsights(date) {
  // Fetch last 14 days of digests for pattern detection
  const digests = db.prepare(
    "SELECT date, summary, best_meal, worst_meal, extra_json FROM daily_insights ORDER BY date DESC LIMIT 14"
  ).all();

  if (digests.length < 2) return; // need at least 2 days of data

  // Fetch all meals from the last 14 days for food names
  const meals = db.prepare(
    "SELECT meal_type, description, timestamp FROM meals WHERE date(timestamp) >= date(?, '-14 days') ORDER BY timestamp"
  ).all(date);

  // Fetch all readings from the last 14 days
  const readings = db.prepare(
    "SELECT reading_type, bg_value, timestamp FROM readings WHERE date(timestamp) >= date(?, '-14 days') ORDER BY timestamp"
  ).all(date);

  // Fetch existing food insights so the model knows what's already tracked
  const existing = db.prepare('SELECT food_name, pattern, evidence FROM food_insights').all();
  const existingLines = existing.length
    ? existing.map(f => `${f.food_name}: ${f.pattern} (${f.evidence})`).join('\n')
    : 'None yet';

  const digestLines = digests.map(d => {
    let line = `${d.date}: best=${d.best_meal ?? 'n/a'}, worst=${d.worst_meal ?? 'n/a'}, ${d.summary}`;
    if (d.extra_json) {
      try {
        const extra = JSON.parse(d.extra_json);
        if (extra.why_it_spiked) line += ` | Spike: ${extra.why_it_spiked}`;
      } catch (_) {}
    }
    return line;
  }).join('\n');

  const mealLines = meals.map(m => {
    const d = m.timestamp.slice(0, 10);
    return `${d} ${m.meal_type}: ${m.description}`;
  }).join('\n');

  const readingLines = readings.map(r => {
    const d = r.timestamp.slice(0, 10);
    return `${d} ${r.reading_type}: ${r.bg_value}`;
  }).join('\n');

  const prompt = `Given the last 14 days of glucose data for a pre-diabetic person, identify foods that have appeared 2+ times with consistent post-meal or overnight outcomes.

Digests:
${digestLines}

Meals:
${mealLines}

Readings:
${readingLines}

Existing food insights:
${existingLines}

Return a JSON array of food insights to upsert. Each entry:
{
  "food_name": "specific food name as logged (e.g. 'shawarma roomali', 'egg bhurji chapati')",
  "pattern": "safe dinner | safe breakfast | spikes post-meal | safe snack | etc",
  "evidence": "brief evidence string, e.g. '3 instances: post-meal 108-119, next fasting 121-128'"
}

Rules:
- Only include foods with 2+ consistent occurrences
- Be specific with food names, match what the user actually logged
- If an existing insight should be updated with new evidence, include it with updated fields
- If no new insights, return an empty array []
- Output only valid JSON array, no markdown, no backticks.`;

  try {
    const client = new Anthropic();
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = message.content[0].text;
    const cleaned = raw.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim();
    const insights = JSON.parse(cleaned);

    if (!Array.isArray(insights)) return;

    const now = new Date().toISOString();
    const upsert = db.prepare(`
      INSERT INTO food_insights (food_name, pattern, evidence, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(food_name) DO UPDATE SET
        pattern = excluded.pattern,
        evidence = excluded.evidence,
        updated_at = excluded.updated_at
    `);

    const runAll = db.transaction(() => {
      for (const ins of insights) {
        if (ins.food_name && ins.pattern && ins.evidence) {
          upsert.run(ins.food_name, ins.pattern, ins.evidence, now, now);
        }
      }
    });
    runAll();
    console.log(`[digest] Updated ${insights.length} food insights`);
  } catch (err) {
    console.error('[digest] food insights extraction failed:', err.message);
  }
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

  // Call Sonnet for digest (critical reasoning, runs once/day max)
  const client = new Anthropic();
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
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

  // Run food insights extraction (async, non-blocking for the digest response)
  updateFoodInsights(date).catch(err => {
    console.error('[digest] food insights update failed:', err.message);
  });

  return db.prepare("SELECT * FROM daily_insights WHERE date = ?").get(date);
}

module.exports = { generateDailyDigest };
