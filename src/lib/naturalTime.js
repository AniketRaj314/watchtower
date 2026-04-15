const CLOCK_12H_RE = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/ig;

function toIsoAt(hour24, minute, now) {
  const d = new Date(now || Date.now());
  d.setHours(hour24, minute, 0, 0);
  return d.toISOString();
}

function parseClockToIso(raw, now) {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.trim();

  const twelveHour = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (twelveHour) {
    let h = Number(twelveHour[1]);
    const m = Number(twelveHour[2] || '0');
    const meridiem = twelveHour[3].toLowerCase();
    if (!Number.isFinite(h) || !Number.isFinite(m) || h < 1 || h > 12 || m < 0 || m > 59) return null;
    if (meridiem === 'am') {
      if (h === 12) h = 0;
    } else if (h !== 12) {
      h += 12;
    }
    return toIsoAt(h, m, now);
  }

  const twentyFourHour = s.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (twentyFourHour) {
    const h = Number(twentyFourHour[1]);
    const m = Number(twentyFourHour[2]);
    return toIsoAt(h, m, now);
  }

  return null;
}

function collectTimeMentions(text, now) {
  const mentions = [];
  let match;
  while ((match = CLOCK_12H_RE.exec(text)) !== null) {
    const iso = parseClockToIso(match[0], now);
    if (iso) {
      mentions.push({
        index: match.index,
        raw: match[0],
        iso,
      });
    }
  }
  CLOCK_12H_RE.lastIndex = 0;
  return mentions;
}

function nearestMention(mentions, index) {
  if (!mentions.length) return null;
  if (index == null || index < 0) return mentions[0];
  let best = mentions[0];
  let bestDist = Math.abs(mentions[0].index - index);
  for (let i = 1; i < mentions.length; i += 1) {
    const dist = Math.abs(mentions[i].index - index);
    if (dist < bestDist) {
      best = mentions[i];
      bestDist = dist;
    }
  }
  return best;
}

function findFirstKeywordIndex(text, patterns) {
  for (const p of patterns) {
    const re = new RegExp(p, 'i');
    const m = text.match(re);
    if (m && typeof m.index === 'number') return m.index;
  }
  return -1;
}

function parseRelativeMinutes(text) {
  if (!text) return null;

  const patterns = [
    /(\d+(?:\.\d+)?)\s*(hours?|hrs?|hr|minutes?|mins?|min)\s*(later|after)\b/i,
    /\b(after)\s*(\d+(?:\.\d+)?)\s*(hours?|hrs?|hr|minutes?|mins?|min)\b/i,
  ];

  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;

    let value;
    let unit;
    if (re === patterns[0]) {
      value = Number(m[1]);
      unit = m[2].toLowerCase();
    } else {
      value = Number(m[2]);
      unit = m[3].toLowerCase();
    }
    if (!Number.isFinite(value) || value <= 0) return null;

    if (unit.startsWith('hour') || unit.startsWith('hr')) {
      return Math.round(value * 60);
    }
    return Math.round(value);
  }

  return null;
}

function addMinutes(iso, minutes) {
  if (!iso || !Number.isFinite(minutes)) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
}

function inferEntryTimestamps(text, parsed, now) {
  const mentions = collectTimeMentions(text, now);

  const mealPatterns = [];
  if (parsed && parsed.meal && parsed.meal.meal_type) {
    mealPatterns.push(`\\b${parsed.meal.meal_type}\\b`);
  }
  mealPatterns.push('\\bmeal\\b', '\\bhad\\b', '\\bate\\b');

  const readingPatterns = [];
  if (parsed && parsed.reading && parsed.reading.reading_type) {
    const t = parsed.reading.reading_type;
    readingPatterns.push(`\\b${t.replace('-', '[-\\s]?')}\\b`);
  }
  readingPatterns.push('\\breading\\b', '\\bglucose\\b', '\\bsugar\\b', '\\bbg\\b');

  const exercisePatterns = ['\\bexercise\\b', '\\bwalk\\b', '\\brun\\b', '\\byoga\\b', '\\bgym\\b', '\\bworkout\\b'];

  const mealIdx = findFirstKeywordIndex(text, mealPatterns);
  const readingIdx = findFirstKeywordIndex(text, readingPatterns);
  const exerciseIdx = findFirstKeywordIndex(text, exercisePatterns);

  const mealMention = nearestMention(mentions, mealIdx);
  const readingMention = nearestMention(mentions, readingIdx);
  const exerciseMention = nearestMention(mentions, exerciseIdx);

  const relativeMinutes = parseRelativeMinutes(text);
  const readingFromRelative = relativeMinutes != null && mealMention
    ? addMinutes(mealMention.iso, relativeMinutes)
    : null;
  const shouldPreferRelativeReading = !!(
    readingFromRelative
    && (
      !readingMention
      || !mealMention
      || readingMention.index === mealMention.index
      || mentions.length === 1
    )
  );

  return {
    meal: mealMention ? mealMention.iso : null,
    reading: shouldPreferRelativeReading
      ? readingFromRelative
      : (readingMention ? readingMention.iso : readingFromRelative),
    exercise: exerciseMention ? exerciseMention.iso : null,
  };
}

function normalizeEntryTimestamp(rawTs, fallbackTs, validateTimestamp, now) {
  if (typeof rawTs === 'string' && rawTs.trim()) {
    const direct = validateTimestamp(rawTs.trim());
    if (direct.valid) return direct.value;

    const fromClock = parseClockToIso(rawTs.trim(), now);
    if (fromClock) {
      const checked = validateTimestamp(fromClock);
      if (checked.valid) return checked.value;
    }
  }
  if (fallbackTs) return fallbackTs;
  return null;
}

function applyParsedTimestamps(parsed, text, options) {
  const validateTimestamp = options && options.validateTimestamp;
  const now = options && options.now;
  if (typeof validateTimestamp !== 'function') {
    throw new Error('validateTimestamp is required');
  }

  const inferredTs = inferEntryTimestamps(text, parsed, now);

  if (parsed && parsed.meal && typeof parsed.meal === 'object') {
    parsed.meal.timestamp = normalizeEntryTimestamp(parsed.meal.timestamp, inferredTs.meal, validateTimestamp, now);
  }
  if (parsed && parsed.reading && typeof parsed.reading === 'object') {
    parsed.reading.timestamp = normalizeEntryTimestamp(parsed.reading.timestamp, inferredTs.reading, validateTimestamp, now);
  }
  if (parsed && parsed.exercise && typeof parsed.exercise === 'object') {
    parsed.exercise.timestamp = normalizeEntryTimestamp(parsed.exercise.timestamp, inferredTs.exercise, validateTimestamp, now);
  }

  return inferredTs;
}

module.exports = {
  parseClockToIso,
  parseRelativeMinutes,
  inferEntryTimestamps,
  normalizeEntryTimestamp,
  applyParsedTimestamps,
};
