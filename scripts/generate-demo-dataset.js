#!/usr/bin/env node
/**
 * Writes src/demo/demo-dataset.json with synthetic meals, readings, and medications.
 * Run from repo root: node scripts/generate-demo-dataset.js
 */
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'src', 'demo', 'demo-dataset.json');
const DAYS = 78;

function pad(n) {
  return String(n).padStart(2, '0');
}

function isoDate(y, m, d) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

function ts(y, m, d, hh, mm) {
  return `${isoDate(y, m, d)}T${pad(hh)}:${pad(mm)}:00Z`;
}

function randBetween(a, b) {
  return a + Math.random() * (b - a);
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const breakfastDesc = ['Oats and fruit', 'Eggs, toast', 'Greek yogurt bowl', 'Idli sambar', 'Paratha'];
const lunchDesc = ['Salad and soup', 'Rice, dal, vegetables', 'Grilled chicken bowl', 'Lentil curry', 'Sandwich'];
const dinnerDesc = ['Grilled fish, greens', 'Khichdi', 'Stir-fry and rice', 'Soup and bread', 'Light curry'];

const medications = [
  {
    id: 1,
    name: 'Metformin XR',
    dose: '500mg',
    frequency: 'twice daily with meals',
    schedule: '1-0-1',
    is_default: 1,
    is_active: 1,
    notes: null,
  },
  {
    id: 2,
    name: 'Demo statin',
    dose: '10mg',
    frequency: 'evening',
    schedule: '0-0-1',
    is_default: 0,
    is_active: 1,
    notes: 'temporary',
  },
];

function generate() {
  const meals = [];
  const readings = [];
  let mealId = 1;
  let readingId = 1;

  const end = new Date();
  end.setHours(0, 0, 0, 0);

  for (let offset = DAYS - 1; offset >= 0; offset--) {
    const day = new Date(end);
    day.setDate(day.getDate() - offset);
    const y = day.getFullYear();
    const mo = day.getMonth() + 1;
    const d = day.getDate();

    const spikeDay = offset === 10;
    const fastingJitter = spikeDay ? randBetween(145, 165) : randBetween(88, 108);

    const mBreakfast = {
      id: mealId++,
      timestamp: ts(y, mo, d, 8, Math.floor(randBetween(0, 25))),
      meal_type: 'breakfast',
      description: pick(breakfastDesc),
      medication_taken: 1,
      medication_snapshot: 'Metformin XR',
      raw_input: null,
    };
    meals.push(mBreakfast);

    readings.push({
      id: readingId++,
      timestamp: ts(y, mo, d, 7, Math.floor(randBetween(15, 45))),
      reading_type: 'fasting',
      bg_value: Math.round(fastingJitter),
      meal_id: null,
      raw_input: null,
    });

    readings.push({
      id: readingId++,
      timestamp: ts(y, mo, d, 9, Math.floor(randBetween(30, 50))),
      reading_type: 'post-meal',
      bg_value: Math.round(spikeDay ? randBetween(195, 220) : randBetween(125, 165)),
      meal_id: mBreakfast.id,
      raw_input: null,
    });

    const mLunch = {
      id: mealId++,
      timestamp: ts(y, mo, d, 13, Math.floor(randBetween(0, 20))),
      meal_type: 'lunch',
      description: pick(lunchDesc),
      medication_taken: 0,
      medication_snapshot: null,
      raw_input: null,
    };
    meals.push(mLunch);

    readings.push({
      id: readingId++,
      timestamp: ts(y, mo, d, 15, Math.floor(randBetween(0, 25))),
      reading_type: 'post-meal',
      bg_value: Math.round(spikeDay ? randBetween(185, 205) : randBetween(130, 175)),
      meal_id: mLunch.id,
      raw_input: null,
    });

    const mDinner = {
      id: mealId++,
      timestamp: ts(y, mo, d, 19, Math.floor(randBetween(0, 30))),
      meal_type: 'dinner',
      description: pick(dinnerDesc),
      medication_taken: 1,
      medication_snapshot: 'Metformin XR, Demo statin',
      raw_input: null,
    };
    meals.push(mDinner);

    readings.push({
      id: readingId++,
      timestamp: ts(y, mo, d, 21, Math.floor(randBetween(0, 20))),
      reading_type: 'post-meal',
      bg_value: Math.round(spikeDay ? randBetween(175, 195) : randBetween(125, 165)),
      meal_id: mDinner.id,
      raw_input: null,
    });

    if (offset % 11 === 0) {
      const mSnack = {
        id: mealId++,
        timestamp: ts(y, mo, d, 16, Math.floor(randBetween(0, 40))),
        meal_type: 'snack',
        description: 'Fruit / tea',
        medication_taken: 0,
        medication_snapshot: null,
        raw_input: null,
      };
      meals.push(mSnack);
    }

    if (offset % 9 === 3) {
      readings.push({
        id: readingId++,
        timestamp: ts(y, mo, d, 22, Math.floor(randBetween(0, 30))),
        reading_type: 'bedtime',
        bg_value: Math.round(randBetween(105, 130)),
        meal_id: null,
        raw_input: null,
      });
    }
  }

  return { medications, meals, readings };
}

const dataset = generate();
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(dataset, null, 2) + '\n', 'utf8');
console.log(`Wrote ${OUT} (${dataset.meals.length} meals, ${dataset.readings.length} readings)`);
