import { describe, it, expect, afterEach } from 'vitest';
import { getDb, resetDbForTests } from '../../src/lib/db';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

afterEach(() => {
  resetDbForTests();
});

describe('getDb', () => {
  it('creates the users table on first call', () => {
    const db = getDb(':memory:');
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
      .get();
    expect(row).toEqual({ name: 'users' });
  });

  it('creates the announcements table on first call', () => {
    const db = getDb(':memory:');
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='announcements'")
      .get();
    expect(row).toEqual({ name: 'announcements' });
  });

  it('creates the mail_templates and mail_log tables on first call', () => {
    const db = getDb(':memory:');
    const templatesRow = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='mail_templates'")
      .get();
    const logRow = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='mail_log'")
      .get();
    expect(templatesRow).toEqual({ name: 'mail_templates' });
    expect(logRow).toEqual({ name: 'mail_log' });
  });

  it('creates the newsletter_subscriptions table on first call', () => {
    const db = getDb(':memory:');
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='newsletter_subscriptions'")
      .get();
    expect(row).toEqual({ name: 'newsletter_subscriptions' });
  });

  it('returns the same connection on repeated calls with no path', () => {
    const db1 = getDb(':memory:');
    const db2 = getDb();
    expect(db2).toBe(db1);
  });

  it('can insert and read back a user', () => {
    const db = getDb(':memory:');
    db.prepare(
      'INSERT INTO users (plex_id, email, username, last_login) VALUES (?, ?, ?, ?)'
    ).run('12345', 'test@example.com', 'tester', new Date().toISOString());
    const row = db.prepare('SELECT * FROM users WHERE plex_id = ?').get('12345') as {
      email: string;
    };
    expect(row.email).toBe('test@example.com');
  });

  it('creates parent directories if they do not exist', () => {
    // Use a temp directory path that doesn't exist yet
    const tempDbPath = resolve('/tmp/plexcrew-test-db-dir/nested/sub/test.db');
    try {
      const db = getDb(tempDbPath);
      // Verify the database was created and has the users table
      const row = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
        .get();
      expect(row).toEqual({ name: 'users' });
    } finally {
      // Clean up the test directory
      resetDbForTests();
      try {
        rmSync('/tmp/plexcrew-test-db-dir', { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });
});
