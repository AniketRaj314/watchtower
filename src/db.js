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
`);

// Seed medications if table is empty
const count = db.prepare('SELECT COUNT(*) AS n FROM medications').get().n;
if (count === 0) {
  const insert = db.prepare(
    'INSERT INTO medications (name, dose, frequency, is_default, is_active, notes) VALUES (?, ?, ?, ?, ?, ?)'
  );
  insert.run('Glycomet SR-500', '500mg', 'with breakfast and dinner', 1, 1, null);
  insert.run('Zoryl 1mg', '0.5mg (half tablet)', 'before breakfast only', 0, 1, 'temporary');
}

module.exports = db;
