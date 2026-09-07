import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getDb, resetDbForTests } from '../../src/lib/db';
import { setSubscribed } from '../../src/lib/newsletter-subscriptions';
import { getMemberOverview, listUsers } from '../../src/lib/members';
import { resetTtlCacheForTests } from '../../src/lib/ttl-cache';

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body } as Response;
}

describe('getMemberOverview', () => {
  beforeEach(() => {
    resetDbForTests();
    // getMemberOverview reads Tautulli activity via getUserActivity, now cached —
    // without this, a test expecting a failure fallback could see an earlier
    // test's successful cached result instead.
    resetTtlCacheForTests();
  });

  it('joins portal users with Tautulli activity and newsletter opt-in status', async () => {
    const db = getDb(':memory:');
    db.prepare('INSERT INTO users (plex_id, email, username, last_login) VALUES (?, ?, ?, ?)').run(
      'p1', 'alice@b.com', 'alice', '2026-08-20T10:00:00.000Z'
    );
    db.prepare('INSERT INTO users (plex_id, email, username, last_login) VALUES (?, ?, ?, ?)').run(
      'p2', 'bob@b.com', 'bob', '2026-08-25T10:00:00.000Z'
    );
    setSubscribed(db, 'p2', false);

    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        response: {
          data: {
            data: [{ email: 'Alice@b.com', last_seen: 1788035871 }],
          },
        },
      })
    );
    vi.spyOn(global, 'fetch').mockImplementation(fetchMock);

    const result = await getMemberOverview(db, 'https://tautulli.example.com', 'apikey');

    // Ordered by last_login DESC — bob first
    expect(result[0]).toEqual({
      plexId: 'p2',
      username: 'bob',
      email: 'bob@b.com',
      portalLastLogin: '2026-08-25T10:00:00.000Z',
      tautulliLastSeen: null,
      newsletterOptedIn: false,
    });
    expect(result[1]).toEqual({
      plexId: 'p1',
      username: 'alice',
      email: 'alice@b.com',
      portalLastLogin: '2026-08-20T10:00:00.000Z',
      tautulliLastSeen: new Date(1788035871 * 1000).toISOString(),
      newsletterOptedIn: true,
    });
  });

  it('defaults every member to no Tautulli activity when the Tautulli request fails, instead of throwing', async () => {
    const db = getDb(':memory:');
    db.prepare('INSERT INTO users (plex_id, email, username, last_login) VALUES (?, ?, ?, ?)').run(
      'p1', 'alice@b.com', 'alice', '2026-08-20T10:00:00.000Z'
    );
    vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({}, false));

    const result = await getMemberOverview(db, 'https://tautulli.example.com', 'apikey');
    expect(result).toEqual([
      {
        plexId: 'p1',
        username: 'alice',
        email: 'alice@b.com',
        portalLastLogin: '2026-08-20T10:00:00.000Z',
        tautulliLastSeen: null,
        newsletterOptedIn: true,
      },
    ]);
  });

  it('returns an empty array when no one has ever logged into the portal', async () => {
    const db = getDb(':memory:');
    vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({ response: { data: { data: [] } } }));
    expect(await getMemberOverview(db, 'https://tautulli.example.com', 'apikey')).toEqual([]);
  });
});

describe('listUsers', () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it('returns portal users ordered by last_login DESC, no Tautulli call', async () => {
    const db = getDb(':memory:');
    db.prepare('INSERT INTO users (plex_id, email, username, last_login) VALUES (?, ?, ?, ?)').run(
      'p1', 'alice@b.com', 'alice', '2026-08-20T10:00:00.000Z'
    );
    db.prepare('INSERT INTO users (plex_id, email, username, last_login) VALUES (?, ?, ?, ?)').run(
      'p2', 'bob@b.com', 'bob', '2026-08-25T10:00:00.000Z'
    );
    const fetchSpy = vi.spyOn(global, 'fetch');

    const result = listUsers(db);

    expect(result).toEqual([
      { plexId: 'p2', username: 'bob', email: 'bob@b.com', lastLogin: '2026-08-25T10:00:00.000Z' },
      { plexId: 'p1', username: 'alice', email: 'alice@b.com', lastLogin: '2026-08-20T10:00:00.000Z' },
    ]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns an empty array when no one has logged in', () => {
    const db = getDb(':memory:');
    expect(listUsers(db)).toEqual([]);
  });
});
