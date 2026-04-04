const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'watchtower.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS medications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    dose TEXT NOT NULL,
    frequency TEXT NOT NULL,
    schedule TEXT NOT NULL DEFAULT '1-1-1',
    is_default INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 0,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS meals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
    description TEXT NOT NULL,
    medication_taken INTEGER NOT NULL DEFAULT 0,
    medication_snapshot TEXT,
    raw_input TEXT
  );

  CREATE TABLE IF NOT EXISTS readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    reading_type TEXT NOT NULL CHECK (reading_type IN ('fasting', 'post-meal', 'pre-meal', 'random', 'bedtime')),
    bg_value REAL NOT NULL,
    meal_id INTEGER,
    raw_input TEXT,
    FOREIGN KEY (meal_id) REFERENCES meals(id)
  );

  CREATE TABLE IF NOT EXISTS daily_insights (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT UNIQUE NOT NULL,
    summary TEXT NOT NULL,
    best_meal TEXT,
    worst_meal TEXT,
    fasting_avg REAL,
    post_meal_avg REAL,
    overall_rating TEXT,
    generated_at TEXT NOT NULL
  );
`);

// Migrate: add schedule column if missing (existing DBs)
const cols = db.prepare("PRAGMA table_info(medications)").all().map(c => c.name);
if (!cols.includes('schedule')) {
  db.exec("ALTER TABLE medications ADD COLUMN schedule TEXT NOT NULL DEFAULT '1-1-1'");
  // Update existing rows with correct schedules
  db.prepare("UPDATE medications SET schedule = '1-0-1' WHERE name = 'Glycomet SR-500'").run();
  db.prepare("UPDATE medications SET schedule = '1-0-0' WHERE name = 'Zoryl 1mg'").run();
}

// Migrate: recompute medication_snapshot on existing meals using schedules
const needsSnapshotFix = db.prepare(
  "SELECT id, meal_type, medication_snapshot FROM meals WHERE medication_taken = 1 AND medication_snapshot IS NOT NULL"
).all();
if (needsSnapshotFix.length > 0) {
  const scheduleIndex = { breakfast: 0, lunch: 1, dinner: 2 };
  const activeMeds = db.prepare('SELECT name, schedule FROM medications').all();
  const update = db.prepare('UPDATE meals SET medication_snapshot = ? WHERE id = ?');
  const fixAll = db.transaction(() => {
    for (const meal of needsSnapshotFix) {
      const idx = scheduleIndex[meal.meal_type];
      let snapshot = null;
      if (idx !== undefined) {
        const filtered = activeMeds.filter(m => {
          const parts = (m.schedule || '1-1-1').split('-');
          return parts[idx] === '1';
        });
        snapshot = filtered.map(m => m.name).join(', ') || null;
      }
      if (snapshot !== meal.medication_snapshot) {
        update.run(snapshot, meal.id);
      }
    }
  });
  fixAll();
}

// Migrate: add meal_ids column to readings if missing
const readingCols = db.prepare("PRAGMA table_info(readings)").all().map(c => c.name);
if (!readingCols.includes('meal_ids')) {
  db.exec("ALTER TABLE readings ADD COLUMN meal_ids TEXT");
}

// Migrate: add extra_json column to daily_insights if missing
const insightCols = db.prepare("PRAGMA table_info(daily_insights)").all().map(c => c.name);
if (!insightCols.includes('extra_json')) {
  db.exec("ALTER TABLE daily_insights ADD COLUMN extra_json TEXT");
}

// Create food_insights table
db.exec(`
  CREATE TABLE IF NOT EXISTS food_insights (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    food_name TEXT NOT NULL UNIQUE,
    pattern TEXT NOT NULL,
    evidence TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );
`);

// Seed medications if table is empty
const count = db.prepare('SELECT COUNT(*) AS n FROM medications').get().n;
if (count === 0) {
  const insert = db.prepare(
    'INSERT INTO medications (name, dose, frequency, schedule, is_default, is_active, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  insert.run('Glycomet SR-500', '500mg', 'with breakfast and dinner', '1-0-1', 1, 1, null);
  insert.run('Zoryl 1mg', '0.5mg (half tablet)', 'before breakfast only', '1-0-0', 0, 1, 'temporary');
}

module.exports = db;
