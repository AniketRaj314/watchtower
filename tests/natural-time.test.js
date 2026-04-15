const test = require('node:test');
const assert = require('node:assert/strict');

const { validateTimestamp } = require('../src/middleware/timestamp');
const {
  parseRelativeMinutes,
  inferEntryTimestamps,
  applyParsedTimestamps,
} = require('../src/lib/naturalTime');

function localHourMinute(iso) {
  const d = new Date(iso);
  return [d.getHours(), d.getMinutes()];
}

test('parseRelativeMinutes parses hour and minute phrases', () => {
  assert.equal(parseRelativeMinutes('2 hours later, reading was 120'), 120);
  assert.equal(parseRelativeMinutes('after 45 min sugar check'), 45);
  assert.equal(parseRelativeMinutes('no relative time here'), null);
});

test('inferEntryTimestamps maps lunch + 2 hours later reading', () => {
  const now = new Date();
  const parsed = {
    meal: { meal_type: 'lunch' },
    reading: { reading_type: 'post-meal' },
  };
  const text = 'Had lunch at 2:40 PM. 2 hours later, reading was 120';
  const inferred = inferEntryTimestamps(text, parsed, now);

  assert.ok(inferred.meal);
  assert.ok(inferred.reading);
  assert.deepEqual(localHourMinute(inferred.meal), [14, 40]);
  assert.deepEqual(localHourMinute(inferred.reading), [16, 40]);
});

test('applyParsedTimestamps normalizes explicit clock timestamp fields', () => {
  const now = new Date();
  const parsed = {
    entry_type: 'both',
    meal: { meal_type: 'lunch', description: 'dal rice', medication_taken: null, timestamp: '2:40 PM' },
    reading: { reading_type: 'post-meal', bg_value: 120, timestamp: null },
    exercise: { activity: null, duration_minutes: null, timestamp: null },
  };
  const text = 'Had dal rice for lunch at 2:40 PM. 2 hours later reading was 120';

  const inferred = applyParsedTimestamps(parsed, text, { validateTimestamp, now });

  assert.ok(inferred.meal);
  assert.ok(inferred.reading);
  assert.ok(parsed.meal.timestamp);
  assert.ok(parsed.reading.timestamp);
  assert.deepEqual(localHourMinute(parsed.meal.timestamp), [14, 40]);
  assert.deepEqual(localHourMinute(parsed.reading.timestamp), [16, 40]);
});
