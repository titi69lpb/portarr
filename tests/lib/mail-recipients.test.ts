import { describe, it, expect, beforeEach } from 'vitest';
import { getDb, resetDbForTests } from '../../src/lib/db';
import { resolveRecipients, dedupeRecipientsByEmail } from '../../src/lib/mail-recipients';
import { fakeSource } from './activity/fake-source';

function seedUsers(db: ReturnType<typeof getDb>) {
  const insert = db.prepare(
    "INSERT INTO users (provider, external_id, email, username, last_login) VALUES ('plex', ?, ?, ?, ?)"
  );
  insert.run('1', 'alice@example.com', 'alice', new Date().toISOString());
  insert.run('2', 'bob@example.com', 'bob', new Date().toISOString());
  insert.run('3', 'carol@example.com', 'carol', new Date().toISOString());
}

describe('resolveRecipients', () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it('broadcast returns every user', async () => {
    const db = getDb(':memory:');
    seedUsers(db);
    const result = await resolveRecipients(db, { mode: 'broadcast' }, [fakeSource('plex')]);
    expect(result.map((r) => r.email).sort()).toEqual([
      'alice@example.com',
      'bob@example.com',
      'carol@example.com',
    ]);
  });

  it('individual returns only the matched emails, case-insensitively', async () => {
    const db = getDb(':memory:');
    seedUsers(db);
    const result = await resolveRecipients(
      db,
      { mode: 'individual', emails: ['ALICE@example.com', 'carol@example.com'] },
      [fakeSource('plex')]
    );
    expect(result.map((r) => r.username).sort()).toEqual(['alice', 'carol']);
  });

  it('group activeSince returns users seen within the window, resolved through the plex activity source', async () => {
    const db = getDb(':memory:');
    seedUsers(db);
    const now = Date.now();
    const lastSeenByEmail: Record<string, string | null> = {
      alice: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString(),
      bob: new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString(),
      carol: null,
    };
    const source = fakeSource('plex', {
      lastSeen: async (member) => lastSeenByEmail[member.username] ?? null,
    });
    const result = await resolveRecipients(db, { mode: 'group', filter: { type: 'activeSince', days: 30 } }, [source]);
    expect(result.map((r) => r.username)).toEqual(['alice']);
  });

  it('group neverActive returns users with no recorded activity', async () => {
    const db = getDb(':memory:');
    seedUsers(db);
    const now = Date.now();
    const lastSeenByEmail: Record<string, string | null> = {
      alice: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString(),
      bob: null,
    };
    const source = fakeSource('plex', {
      lastSeen: async (member) => lastSeenByEmail[member.username] ?? null,
    });
    const result = await resolveRecipients(db, { mode: 'group', filter: { type: 'neverActive' } }, [source]);
    // carol has no activity record at all, which also counts as never active
    expect(result.map((r) => r.username).sort()).toEqual(['bob', 'carol']);
  });

  it('a member whose provider has no active source is treated as never active', async () => {
    const db = getDb(':memory:');
    const insert = db.prepare(
      "INSERT INTO users (provider, external_id, email, username, last_login) VALUES ('jellyfin', 'j1', 'dana@example.com', 'dana', '')"
    );
    insert.run();
    // Only a plex source is active — the jellyfin member has no matching ActivitySource.
    const result = await resolveRecipients(db, { mode: 'group', filter: { type: 'neverActive' } }, [fakeSource('plex')]);
    expect(result.map((r) => r.username)).toEqual(['dana']);
  });
});

describe('dedupeRecipientsByEmail', () => {
  it('keeps the first recipient of each address, case-insensitively, preserving order', () => {
    const result = dedupeRecipientsByEmail([
      { email: 'Alice@Example.com', username: 'alice-plex' },
      { email: 'bob@example.com', username: 'bob' },
      { email: 'alice@example.com', username: 'alice-jf' },
    ]);
    expect(result.map((r) => r.username)).toEqual(['alice-plex', 'bob']);
  });

  it('returns distinct addresses untouched', () => {
    const input = [
      { email: 'a@example.com', username: 'a' },
      { email: 'b@example.com', username: 'b' },
    ];
    expect(dedupeRecipientsByEmail(input)).toEqual(input);
  });
});

describe('resolveRecipients with one address shared by two members', () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it('mails the shared address once in every mode', async () => {
    const db = getDb(':memory:');
    const insert = db.prepare(
      "INSERT INTO users (provider, external_id, email, username, last_login) VALUES (?, ?, ?, ?, '')"
    );
    insert.run('plex', '1', 'shared@example.com', 'alice');
    insert.run('jellyfin', 'j1', 'Shared@Example.com', 'alice-jf');
    const sources = [fakeSource('plex'), fakeSource('jellyfin')];

    expect(await resolveRecipients(db, { mode: 'broadcast' }, sources)).toHaveLength(1);
    expect(
      await resolveRecipients(db, { mode: 'individual', emails: ['shared@example.com'] }, sources)
    ).toHaveLength(1);
    expect(
      await resolveRecipients(db, { mode: 'group', filter: { type: 'neverActive' } }, sources)
    ).toHaveLength(1);
  });
});
