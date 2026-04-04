const Anthropic = require('@anthropic-ai/sdk');
const db = require('./db');

// --- In-memory cache ---
// Key: "YYYY-MM-DD|meal_context", Value: { data, timestamp }
const cache = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function invalidateCache() {
  cache.clear();
}

function getCacheKey(date, mealContext) {
  return `${date}|${mealContext}`;
}

function getCached(date, mealContext) {
  const key = getCacheKey(date, mealContext);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(date, mealContext, data) {
  cache.set(getCacheKey(date, mealContext), { data, timestamp: Date.now() });
}

// --- Meal context ---
function getMealContext(timeStr) {
  const [h] = timeStr.split(':').map(Number);
  if (h < 10) return 'pre_breakfast';
  if (h < 14) return 'pre_lunch';
  if (h < 18) return 'pre_dinner';
  return 'evening';
}

// --- Earned treat logic ---
function checkEarnedTreat(digests, todayReadings) {
  if (digests.length < 3) return false;

  const lastThree = digests.slice(0, 3);
  const goodCount = lastThree.filter(d => d.overall_rating === 'good').length;
  if (goodCount < 2) return false;

  const todayFasting = todayReadings.filter(r => r.reading_type === 'fasting');
  if (todayFasting.length === 0) return true; // no fasting reading yet, don't penalise
  return todayFasting.every(r => r.bg_value < 120);
}

// --- Confidence ---
function getConfidence(digestCount) {
  if (digestCount >= 7) return 'high';
  if (digestCount >= 3) return 'medium';
  return 'low';
}

const SYSTEM_PROMPT = `You are Watchtower, a sharp and warm glucose coach for someone who is pre-diabetic and actively managing their condition through food and lifestyle.

Key facts:
- Pre-diabetic, not Type 2 diabetic. Use pre-diabetic language throughout.
- Medications are injected dynamically in the user message. Use them to understand which levers are active at each meal.
- Eats Indian food daily. You know his meals well: chapati, dal, sabzi, dahi, eggs, shawarma, paneer, South Indian dishes.
- Targets: fasting below 120, post-meal below 140.
- He tracks consistently and is data-driven. Do not explain basics he already knows.

Tone: direct, specific, encouraging. Like a coach who has been watching his data for weeks. Never preachy. Never generic. Always reference his actual foods by name. If he had a good day, say so clearly and explain why it worked. If something spiked, name the food and the reason.
Output only valid JSON, no markdown, no backticks.`;

function fetchMedicationLines() {
  const meds = db.prepare('SELECT name, dose, frequency, schedule, is_active FROM medications').all();
  if (!meds.length) return 'None';
  return meds.map(m => {
    const status = m.is_active ? 'active' : 'inactive';
    return `${m.name} ${m.dose} — ${m.frequency} (schedule: ${m.schedule}, ${status})`;
  }).join('\n  ');
}

function fetchFoodInsightLines() {
  const rows = db.prepare('SELECT food_name, pattern, evidence FROM food_insights ORDER BY updated_at DESC').all();
  if (!rows.length) return 'None yet — still learning from your data.';
  return rows.map(r => `${r.food_name}: ${r.pattern} (${r.evidence})`).join('\n  ');
}

function buildUserPrompt(digests, todayMeals, todayReadings, todayDate, mealContext, earnedTreat) {
  const digestLines = digests.map(d => {
    let line = `${d.date}: rating=${d.overall_rating}, fasting_avg=${d.fasting_avg ?? 'n/a'}, post_meal_avg=${d.post_meal_avg ?? 'n/a'}, best=${d.best_meal ?? 'n/a'}, worst=${d.worst_meal ?? 'n/a'}`;
    line += `\n  Summary: ${d.summary}`;
    if (d.extra_json) {
      try {
        const extra = JSON.parse(d.extra_json);
        if (extra.why_it_spiked) line += `\n  Why it spiked: ${extra.why_it_spiked}`;
        if (extra.tomorrow_focus) line += `\n  Tomorrow focus: ${extra.tomorrow_focus}`;
      } catch (_) { /* ignore parse errors */ }
    }
    return line;
  }).join('\n\n');

  const todayEntries = [];
  for (const m of todayMeals) {
    const ts = m.timestamp.endsWith('Z') ? m.timestamp : m.timestamp + 'Z';
    const time = new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    let text = `[${time}] Meal (${m.meal_type}): ${m.description}`;
    if (m.medication_taken && m.medication_snapshot) {
      text += ` [meds: ${m.medication_snapshot}]`;
    }
    todayEntries.push({ sort: ts, text });
  }
  for (const r of todayReadings) {
    const ts = r.timestamp.endsWith('Z') ? r.timestamp : r.timestamp + 'Z';
    const time = new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    todayEntries.push({ sort: ts, text: `[${time}] Reading (${r.reading_type}): ${r.bg_value} mg/dL` });
  }
  todayEntries.sort((a, b) => a.sort.localeCompare(b.sort));
  const todayText = todayEntries.map(e => e.text).join('\n') || 'Nothing logged yet today.';

  const medicationLines = fetchMedicationLines();
  const foodInsightLines = fetchFoodInsightLines();

  return `Established personal food patterns (treat these as facts, not suggestions):
  ${foodInsightLines}

Past 14 days of digests:
${digestLines || 'No digest data available yet.'}

Today so far (${todayDate}):
${todayText}

Medications:
  ${medicationLines}

Current context: ${mealContext}
Earned treat mode: ${earnedTreat}

Return JSON:
{
  "headline": "string (one direct sentence, max 12 words, the main recommendation or observation for right now)",
  "body": "string (2-3 sentences, warm coach tone, references their actual past foods by name)",
  "reasoning": "string (2-3 sentences of data explanation — which past meals, which readings inform this. Shown only when user taps 'why this?')",
  "type": "recommendation | caution | encouragement | treat",
  "treat_message": "string or null (null unless earned_treat is true. If true: one specific enjoyable food suggestion for tonight)",
  "confidence": "${getConfidence(digests.length)}"
}`;
}

async function generateRecommendation(currentTime, forceRefresh = false) {
  const now = new Date();
  const todayDate = now.toISOString().slice(0, 10);
  const timeStr = currentTime || now.toTimeString().slice(0, 5);
  const mealContext = getMealContext(timeStr);

  if (!forceRefresh) {
    const cached = getCached(todayDate, mealContext);
    if (cached) return cached;
  }

  // Fetch data
  const digests = db.prepare(
    "SELECT * FROM daily_insights ORDER BY date DESC LIMIT 14"
  ).all();

  const todayMeals = db.prepare(
    "SELECT * FROM meals WHERE date(timestamp) = ? ORDER BY timestamp ASC"
  ).all(todayDate);

  const todayReadings = db.prepare(
    "SELECT * FROM readings WHERE date(timestamp) = ? ORDER BY timestamp ASC"
  ).all(todayDate);

  const earnedTreat = checkEarnedTreat(digests, todayReadings);
  const confidence = getConfidence(digests.length);

  // Call Haiku
  const client = new Anthropic();
  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(digests, todayMeals, todayReadings, todayDate, mealContext, earnedTreat) }],
  });

  const raw = message.content[0].text;
  const cleaned = raw.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim();
  const parsed = JSON.parse(cleaned);

  const result = {
    headline: parsed.headline,
    body: parsed.body,
    reasoning: parsed.reasoning,
    type: parsed.type,
    treat_message: earnedTreat ? parsed.treat_message : null,
    confidence,
    earned_treat: earnedTreat,
    data_days: digests.length,
    generated_at: new Date().toISOString(),
  };

  setCache(todayDate, mealContext, result);
  return result;
}

module.exports = { generateRecommendation, invalidateCache };
