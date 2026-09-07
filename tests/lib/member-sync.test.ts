import { describe, it, expect, beforeEach } from 'vitest';
import { getDb, resetDbForTests } from '../../src/lib/db';
import { syncPlexUsers } from '../../src/lib/member-sync';
import type { PlexSharedUser } from '../../src/lib/plex';

describe('syncPlexUsers', () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it('inserts a never-logged-in Plex user with last_login as an empty string, not throwing on the NOT NULL column', () => {
    const db = getDb(':memory:');
    const plexUsers: PlexSharedUser[] = [{ plexId: '1', email: 'a@b.com', username: 'alice' }];

    const result = syncPlexUsers(db, plexUsers);

    expect(result).toEqual({ added: 1, updated: 0, skippedNoEmail: 0, total: 1 });
    const row = db.prepare('SELECT * FROM users WHERE plex_id = ?').get('1') as {
      email: string;
      username: string;
      last_login: string;
    };
    expect(row.email).toBe('a@b.com');
    expect(row.username).toBe('alice');
    expect(row.last_login).toBe('');
  });

  it('never overwrites a real last_login for a user who has already logged into the portal', () => {
    const db = getDb(':memory:');
    db.prepare('INSERT INTO users (plex_id, email, username, last_login) VALUES (?, ?, ?, ?)').run(
      '1', 'old@b.com', 'oldname', '2026-08-01T00:00:00.000Z'
    );

    const result = syncPlexUsers(db, [{ plexId: '1', email: 'new@b.com', username: 'newname' }]);

    expect(result).toEqual({ added: 0, updated: 1, skippedNoEmail: 0, total: 1 });
    const row = db.prepare('SELECT * FROM users WHERE plex_id = ?').get('1') as {
      email: string;
      username: string;
      last_login: string;
    };
    // email/username refreshed from Plex, but the real login timestamp is untouched
    expect(row.email).toBe('new@b.com');
    expect(row.username).toBe('newname');
    expect(row.last_login).toBe('2026-08-01T00:00:00.000Z');
  });

  it('skips a Plex user with no email — nothing to mail them at, and the email column is NOT NULL', () => {
    const db = getDb(':memory:');
    const result = syncPlexUsers(db, [{ plexId: '1', email: '', username: 'noemail' }]);

    expect(result).toEqual({ added: 0, updated: 0, skippedNoEmail: 1, total: 0 });
    expect(db.prepare('SELECT COUNT(*) as c FROM users').get()).toEqual({ c: 0 });
  });

  it('handles a mixed batch — new users, an existing user, and one with no email', () => {
    const db = getDb(':memory:');
    db.prepare('INSERT INTO users (plex_id, email, username, last_login) VALUES (?, ?, ?, ?)').run(
      '1', 'existing@b.com', 'existing', '2026-08-01T00:00:00.000Z'
    );

    const result = syncPlexUsers(db, [
      { plexId: '1', email: 'existing@b.com', username: 'existing' },
      { plexId: '2', email: 'new1@b.com', username: 'new1' },
      { plexId: '3', email: 'new2@b.com', username: 'new2' },
      { plexId: '4', email: '', username: 'noemail' },
    ]);

    expect(result).toEqual({ added: 2, updated: 1, skippedNoEmail: 1, total: 3 });
  });

  it('returns all-zero counts for an empty Plex user list, without throwing', () => {
    const db = getDb(':memory:');
    expect(syncPlexUsers(db, [])).toEqual({ added: 0, updated: 0, skippedNoEmail: 0, total: 0 });
  });
});
