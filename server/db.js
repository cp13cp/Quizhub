// Uses Node's built-in SQLite (node:sqlite, available in Node 22.5+/24).
// API is a close match to better-sqlite3: prepare/get/all/run.
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'data.db'));
db.exec('PRAGMA journal_mode = WAL;');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'user',
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS question_sets (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    title        TEXT NOT NULL,
    description  TEXT,
    text_content TEXT,
    pdf_path     TEXT,
    category     TEXT,
    max_score    INTEGER NOT NULL DEFAULT 100,
    created_by   INTEGER NOT NULL,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS submissions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    question_set_id INTEGER NOT NULL,
    user_id         INTEGER NOT NULL,
    answer_text     TEXT,
    answers_json    TEXT,
    score           INTEGER,
    status          TEXT NOT NULL DEFAULT 'pending',
    feedback        TEXT,
    submitted_at    TEXT NOT NULL DEFAULT (datetime('now')),
    graded_at       TEXT,
    FOREIGN KEY (question_set_id) REFERENCES question_sets(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS questions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    question_set_id INTEGER NOT NULL,
    question_text   TEXT NOT NULL,
    options_json    TEXT NOT NULL,
    correct_index   INTEGER NOT NULL,
    position        INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (question_set_id) REFERENCES question_sets(id)
  );

  CREATE TABLE IF NOT EXISTS notes (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    title        TEXT NOT NULL,
    description  TEXT,
    file_path    TEXT NOT NULL,
    uploaded_by  INTEGER NOT NULL,
    original_name TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (uploaded_by) REFERENCES users(id)
  );
`);

module.exports = db;
