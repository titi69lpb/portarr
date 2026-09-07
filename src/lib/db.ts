import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

let instance: Database.Database | null = null;
let instancePath: string | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  plex_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  username TEXT NOT NULL,
  last_login TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_markdown TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mail_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_markdown TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mail_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER,
  template_name TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  recipient_username TEXT,
  sent_at TEXT NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS newsletter_subscriptions (
  plex_id TEXT PRIMARY KEY,
  opted_in INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS newsletter_archive (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject TEXT NOT NULL,
  html TEXT NOT NULL,
  sent_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notified_availability (
  request_id INTEGER PRIMARY KEY,
  notified_at TEXT NOT NULL
);
`;

export function getDb(dbPath?: string): Database.Database {
  // If no explicit path and we have an instance, return it
  if (dbPath === undefined && instance) {
    return instance;
  }

  const resolvedPath = dbPath ?? process.env.DATABASE_PATH ?? './data/portal.db';

  if (instance && instancePath === resolvedPath) {
    return instance;
  }

  if (instance) {
    instance.close();
  }

  // Create parent directory if needed (skip for :memory: paths)
  if (resolvedPath !== ':memory:') {
    mkdirSync(dirname(resolvedPath), { recursive: true });
  }

  instance = new Database(resolvedPath);
  instance.pragma('journal_mode = WAL');
  instance.exec(SCHEMA);
  instancePath = resolvedPath;
  return instance;
}

export function resetDbForTests(): void {
  if (instance) {
    instance.close();
  }
  instance = null;
  instancePath = null;
}
