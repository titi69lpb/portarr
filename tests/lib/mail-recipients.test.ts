import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getDb, resetDbForTests } from '../../src/lib/db';
import { resolveRecipients, dedupeRecipientsByEmail, type RecipientDeps } from '../../src/lib/mail-recipients';

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
    const deps: RecipientDeps = { getUserActivity: vi.fn() };
    const result = await resolveRecipients(db, { mode: 'broadcast' }, deps, {
      url: 'https://tautulli.local',
      apiKey: 'key',
    });
    expect(result.map((r) => r.email).sort()).toEqual([
      'alice@example.com',
      'bob@example.com',
      'carol@example.com',
    ]);
    expect(deps.getUserActivity).not.toHaveBeenCalled();
  });

  it('individual returns only the matched emails, case-insensitively', async () => {
    const db = getDb(':memory:');
    seedUsers(db);
    const deps: RecipientDeps = { getUserActivity: vi.fn() };
    const result = await resolveRecipients(
      db,
      { mode: 'individual', emails: ['ALICE@example.com', 'carol@example.com'] },
      deps,
      { url: 'https://tautulli.local', apiKey: 'key' }
    );
    expect(result.map((r) => r.username).sort()).toEqual(['alice', 'carol']);
  });

  it('group activeSince returns users seen within the window', async () => {
    const db = getDb(':memory:');
    seedUsers(db);
    const now = Date.now();
    const deps: RecipientDeps = {
      getUserActivity: vi.fn().mockResolvedValue([
        { email: 'alice@example.com', lastSeenAt: new Date(now - 5 * 24 * 60 * 60 * 1000) },
        { email: 'bob@example.com', lastSeenAt: new Date(now - 90 * 24 * 60 * 60 * 1000) },
        { email: 'carol@example.com', lastSeenAt: null },
      ]),
    };
    const result = await resolveRecipients(
      db,
      { mode: 'group', filter: { type: 'activeSince', days: 30 } },
      deps,
      { url: 'https://tautulli.local', apiKey: 'key' }
    );
    expect(result.map((r) => r.username)).toEqual(['alice']);
  });

  it('group neverActive returns users with no recorded activity', async () => {
    const db = getDb(':memory:');
    seedUsers(db);
    const now = Date.now();
    const deps: RecipientDeps = {
      getUserActivity: vi.fn().mockResolvedValue([
        { email: 'alice@example.com', lastSeenAt: new Date(now - 5 * 24 * 60 * 60 * 1000) },
        { email: 'bob@example.com', lastSeenAt: null },
      ]),
    };
    const result = await resolveRecipients(
      db,
      { mode: 'group', filter: { type: 'neverActive' } },
      deps,
      { url: 'https://tautulli.local', apiKey: 'key' }
    );
    // carol has no Tautulli record at all, which also counts as never active
    expect(result.map((r) => r.username).sort()).toEqual(['bob', 'carol']);
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
    const deps: RecipientDeps = { getUserActivity: vi.fn().mockResolvedValue([]) };
    const ctx = { url: 'https://tautulli.local', apiKey: 'key' };

    expect(await resolveRecipients(db, { mode: 'broadcast' }, deps, ctx)).toHaveLength(1);
    expect(
      await resolveRecipients(db, { mode: 'individual', emails: ['shared@example.com'] }, deps, ctx)
    ).toHaveLength(1);
    expect(
      await resolveRecipients(db, { mode: 'group', filter: { type: 'neverActive' } }, deps, ctx)
    ).toHaveLength(1);
  });
});
