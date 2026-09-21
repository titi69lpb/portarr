import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getDb, resetDbForTests, LEGACY_BACKUP_SUFFIX } from '../../src/lib/db';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'portarr-migration-'));
});

afterEach(() => {
  resetDbForTests();
  rmSync(dir, { recursive: true, force: true });
});

function makeLegacyDb(): string {
  const path = join(dir, 'portal.db');
  const legacy = new Database(path);
  legacy.pragma('journal_mode = WAL');
  legacy.exec(`
    CREATE TABLE users (
      plex_id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      username TEXT NOT NULL,
      last_login TEXT NOT NULL
    );
    CREATE TABLE newsletter_subscriptions (
      plex_id TEXT PRIMARY KEY,
      opted_in INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );
  `);
  legacy
    .prepare('INSERT INTO users (plex_id, email, username, last_login) VALUES (?, ?, ?, ?)')
    .run('42', 'a@b.com', 'alice', '2026-01-01T00:00:00.000Z');
  legacy
    .prepare('INSERT INTO newsletter_subscriptions (plex_id, opted_in, updated_at) VALUES (?, ?, ?)')
    .run('42', 0, '2026-01-02T00:00:00.000Z');
  legacy.close();
  return path;
}

describe('provider-keyed migration', () => {
  it('migrates legacy users to provider plex, keeping every column', () => {
    const db = getDb(makeLegacyDb());
    const rows = db
      .prepare('SELECT provider, external_id, email, username, last_login FROM users')
      .all();
    expect(rows).toEqual([
      { provider: 'plex', external_id: '42', email: 'a@b.com', username: 'alice', last_login: '2026-01-01T00:00:00.000Z' },
    ]);
  });

  it('migrates legacy subscriptions and preserves opted_in', () => {
    const db = getDb(makeLegacyDb());
    const rows = db
      .prepare('SELECT provider, external_id, opted_in, updated_at FROM newsletter_subscriptions')
      .all();
    expect(rows).toEqual([
      { provider: 'plex', external_id: '42', opted_in: 0, updated_at: '2026-01-02T00:00:00.000Z' },
    ]);
  });

  it('leaves no legacy tables behind', () => {
    const db = getDb(makeLegacyDb());
    const leftovers = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%_legacy'")
      .all();
    expect(leftovers).toEqual([]);
  });

  it('writes the pre-migration backup, containing the legacy schema and data', () => {
    const path = makeLegacyDb();
    getDb(path);
    const backupPath = `${path}${LEGACY_BACKUP_SUFFIX}`;
    expect(existsSync(backupPath)).toBe(true);
    const backup = new Database(backupPath, { readonly: true });
    const rows = backup.prepare('SELECT plex_id, email FROM users').all();
    backup.close();
    expect(rows).toEqual([{ plex_id: '42', email: 'a@b.com' }]);
  });

  it('is idempotent: reopening keeps the data and does not overwrite the backup', () => {
    const path = makeLegacyDb();
    const first = getDb(path);
    first
      .prepare("INSERT INTO users (provider, external_id, email, username, last_login) VALUES ('plex', '43', 'c@d.com', 'carol', '')")
      .run();
    resetDbForTests();

    const second = getDb(path);
    const ids = second.prepare('SELECT external_id FROM users ORDER BY external_id').all();
    expect(ids).toEqual([{ external_id: '42' }, { external_id: '43' }]);

    const backup = new Database(`${path}${LEGACY_BACKUP_SUFFIX}`, { readonly: true });
    const backupRows = backup.prepare('SELECT plex_id FROM users').all();
    backup.close();
    expect(backupRows).toEqual([{ plex_id: '42' }]);
  });

  it('creates the new schema directly on a fresh database, with no backup', () => {
    const path = join(dir, 'fresh.db');
    const db = getDb(path);
    const cols = (db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).map((c) => c.name);
    expect(cols).toEqual(['provider', 'external_id', 'email', 'username', 'last_login']);
    expect(existsSync(`${path}${LEGACY_BACKUP_SUFFIX}`)).toBe(false);
  });

  it('allows the same external_id under two different providers, but not twice under one', () => {
    const db = getDb(join(dir, 'fresh.db'));
    const insert = db.prepare(
      'INSERT INTO users (provider, external_id, email, username, last_login) VALUES (?, ?, ?, ?, ?)'
    );
    insert.run('plex', '7', 'a@b.com', 'a', '');
    insert.run('jellyfin', '7', 'a@b.com', 'a', '');
    expect(() => insert.run('plex', '7', 'x@y.com', 'x', '')).toThrow();
  });
});
