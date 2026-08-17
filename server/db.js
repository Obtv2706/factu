'use strict';

const path = require('path');
const fs = require('fs');

const originalEmit = process.emit;
process.emit = function (type, ...args) {
  if (
    type === 'warning' &&
    args[0] &&
    args[0].name === 'ExperimentalWarning' &&
    /SQLite|node:sqlite/i.test(args[0].message)
  ) {
    return false;
  }
  return originalEmit.apply(this, [type, ...args]);
};

const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'factu.db'));
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('admin','editor')),
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  id               INTEGER PRIMARY KEY CHECK (id = 1),
  company_name     TEXT NOT NULL DEFAULT '',
  company_phone    TEXT NOT NULL DEFAULT '',
  company_email    TEXT NOT NULL DEFAULT '',
  company_address  TEXT NOT NULL DEFAULT '',
  logo_url         TEXT NOT NULL DEFAULT '',
  default_profit_pct REAL NOT NULL DEFAULT 25,
  footer_note      TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS projects (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_name       TEXT NOT NULL DEFAULT '',
  project_name      TEXT NOT NULL DEFAULT '',
  phone             TEXT NOT NULL DEFAULT '',
  email             TEXT NOT NULL DEFAULT '',
  address           TEXT NOT NULL DEFAULT '',
  date              TEXT NOT NULL DEFAULT '',
  currency          TEXT NOT NULL DEFAULT '$',
  notes             TEXT NOT NULL DEFAULT '',
  default_profit_pct REAL NOT NULL DEFAULT 25,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  profit_pct REAL NOT NULL DEFAULT 25,
  excluded   INTEGER NOT NULL DEFAULT 0,
  note       TEXT NOT NULL DEFAULT '',
  position   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  stage_id    INTEGER NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
  description TEXT NOT NULL DEFAULT '',
  qty         REAL NOT NULL DEFAULT 0,
  unit        TEXT NOT NULL DEFAULT '',
  cost        REAL NOT NULL DEFAULT 0,
  position    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_stages_project ON stages(project_id);
CREATE INDEX IF NOT EXISTS idx_items_stage ON items(stage_id);
`);

function seedAdmin() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (count > 0) return;

  let email = process.env.ADMIN_EMAIL;
  let password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('[db] Sin ADMIN_EMAIL/ADMIN_PASSWORD en produccion. Creando admin por defecto (CAMBIAR).');
    }
    email = email || 'admin@factu.app';
    password = password || 'admin123';
  }

  const hash = bcrypt.hashSync(password, 10);
  db.prepare(
    'INSERT INTO users (email, name, password_hash, role, active) VALUES (?, ?, ?, ?, 1)'
  ).run(email, 'Administrador', hash, 'admin');
  console.log('[db] Admin creado: ' + email);
}

function seedSettings() {
  const row = db.prepare('SELECT id FROM settings WHERE id = 1').get();
  if (!row) {
    db.prepare('INSERT INTO settings (id) VALUES (1)').run();
  }
}

seedSettings();
seedAdmin();

db.transaction = function (fn) {
  return function (...args) {
    db.exec('BEGIN TRANSACTION');
    try {
      const result = fn(...args);
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };
};

module.exports = db;
