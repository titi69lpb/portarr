import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createJellyfinProvider } from '../../../src/lib/media/jellyfin-provider';
import { resetTtlCacheForTests } from '../../../src/lib/ttl-cache';

const CFG = { url: 'http://jellyfin.local:8096', apiKey: 'key123' };
const UID = '1a2b3c4d5e6f47a8b9c0d1e2f3a4b5c6';

beforeEach(() => {
  resetTtlCacheForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function res(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: async () => body,
    headers: new Headers(),
    arrayBuffer: async () => new ArrayBuffer(0),
  } as unknown as Response;
}

function stub(routes: Record<string, () => Response>): typeof fetch {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    const hit = Object.keys(routes).find((fragment) => url.includes(fragment));
    if (!hit) throw new Error(`unexpected fetch: ${url}`);
    return routes[hit]();
  }) as unknown as typeof fetch;
}

const urls = (fetchFn: typeof fetch) =>
  (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));

const USERS = [
  { Id: UID, Name: 'alice', Policy: { IsAdministrator: true, IsDisabled: false, IsHidden: true } },
  { Id: 'c'.repeat(32), Name: 'guest', Policy: { IsAdministrator: false, IsDisabled: false } },
  { Id: 'd'.repeat(32), Name: 'gone', Policy: { IsAdministrator: false, IsDisabled: true } },
];

describe('createJellyfinProvider: identity and members', () => {
  it('identifies itself as the jellyfin password provider', () => {
    const p = createJellyfinProvider(CFG, stub({}));
    expect(p.id).toBe('jellyfin');
    expect(p.displayName).toBe('Jellyfin');
    expect(p.auth.kind).toBe('password');
  });

  it('listMembers returns enabled users (hidden ones included) with an empty email', async () => {
    const p = createJellyfinProvider(CFG, stub({ '/Users': () => res(USERS) }));
    expect(await p.listMembers()).toEqual([
      { provider: 'jellyfin', userId: UID, email: '', username: 'alice' },
      { provider: 'jellyfin', userId: 'c'.repeat(32), email: '', username: 'guest' },
    ]);
  });

  it('isMember is true for an enabled user (dashes and case ignored), false for disabled or unknown', async () => {
    const p = createJellyfinProvider(CFG, stub({ '/Users': () => res(USERS) }));
    expect(await p.isMember(UID)).toBe(true);
    expect(await p.isMember('1A2B3C4D-5E6F-47A8-B9C0-D1E2F3A4B5C6')).toBe(true);
    expect(await p.isMember('d'.repeat(32))).toBe(false);
    expect(await p.isMember('e'.repeat(32))).toBe(false);
  });

  it('isMember fails open when Jellyfin is unreachable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const failing = vi.fn(async () => {
      throw new Error('down');
    }) as unknown as typeof fetch;
    expect(await createJellyfinProvider(CFG, failing).isMember(UID)).toBe(true);
  });
});

describe('createJellyfinProvider: password auth', () => {
  const OK_BODY = {
    User: { Id: UID, Name: 'alice', Policy: { IsAdministrator: true, IsDisabled: false } },
    AccessToken: 'usertoken',
  };

  it('returns the member and admin flag, then ends the temporary Jellyfin session', async () => {
    const fetchFn = stub({
      '/Users/AuthenticateByName': () => res(OK_BODY),
      '/Sessions/Logout': () => res(null, 204),
    });
    const auth = createJellyfinProvider(CFG, fetchFn).auth;
    if (auth.kind !== 'password') throw new Error('expected password auth');
    expect(await auth.authenticate('alice', 's3cret')).toEqual({
      status: 'ok',
      user: { provider: 'jellyfin', userId: UID, email: '', username: 'alice' },
      isOwner: true,
    });
    const calls = urls(fetchFn);
    expect(calls[0]).toContain('/Users/AuthenticateByName');
    expect(calls[1]).toContain('/Sessions/Logout');
  });

  it('is denied on 401 and does not try to log out', async () => {
    const fetchFn = stub({ '/Users/AuthenticateByName': () => res('nope', 401) });
    const auth = createJellyfinProvider(CFG, fetchFn).auth;
    if (auth.kind !== 'password') throw new Error('expected password auth');
    expect(await auth.authenticate('x', 'y')).toEqual({ status: 'denied' });
    expect(urls(fetchFn)).toHaveLength(1);
  });

  it('is denied for a disabled account', async () => {
    const fetchFn = stub({
      '/Users/AuthenticateByName': () =>
        res({ User: { Id: UID, Name: 'alice', Policy: { IsAdministrator: false, IsDisabled: true } }, AccessToken: 't' }),
      '/Sessions/Logout': () => res(null, 204),
    });
    const auth = createJellyfinProvider(CFG, fetchFn).auth;
    if (auth.kind !== 'password') throw new Error('expected password auth');
    expect(await auth.authenticate('alice', 'pw')).toEqual({ status: 'denied' });
    // Same round-trips as a successful login, so the disabled state is not timeable.
    expect(urls(fetchFn).some((u) => u.includes('/Sessions/Logout'))).toBe(true);
  });

  it('is denied on 403 (disabled/blocked account) and has no session to log out', async () => {
    const fetchFn = stub({ '/Users/AuthenticateByName': () => res('Forbidden', 403) });
    const auth = createJellyfinProvider(CFG, fetchFn).auth;
    if (auth.kind !== 'password') throw new Error('expected password auth');
    expect(await auth.authenticate('alice', 'pw')).toEqual({ status: 'denied' });
    expect(urls(fetchFn)).toHaveLength(1);
    expect(urls(fetchFn).some((u) => u.includes('/Sessions/Logout'))).toBe(false);
  });

  it('still succeeds when the temporary session cannot be ended', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchFn = stub({
      '/Users/AuthenticateByName': () => res(OK_BODY),
      '/Sessions/Logout': () => res({}, 500),
    });
    const auth = createJellyfinProvider(CFG, fetchFn).auth;
    if (auth.kind !== 'password') throw new Error('expected password auth');
    expect((await auth.authenticate('alice', 'pw')).status).toBe('ok');
    expect(errorSpy).toHaveBeenCalled();
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('usertoken');
  });
});

describe('createJellyfinProvider: library', () => {
  const MOVIE_NEW = { Id: 'a'.repeat(32), Name: 'The Way', Type: 'Movie', ServerId: 'srv', DateCreated: '2026-09-18T13:47:40.8231662Z', ProductionYear: 2010, ImageTags: { Primary: 't' } };
  const MOVIE_NO_POSTER = { Id: 'b'.repeat(32), Name: 'Plain', Type: 'Movie', ServerId: 'srv', DateCreated: '2026-09-15T09:07:19Z', ImageTags: {} };
  const EP_A2 = { Id: '1'.repeat(32), Name: 'E2', Type: 'Episode', ServerId: 'srv', DateCreated: '2026-09-21T09:00:00Z', SeriesName: 'Futurama', SeriesId: 'f'.repeat(32), SeasonId: 'e'.repeat(32), ImageTags: { Primary: 't' }, SeriesPrimaryImageTag: 's', ParentPrimaryImageItemId: 'e'.repeat(32) };
  const EP_A1 = { ...EP_A2, Id: '2'.repeat(32), Name: 'E1', DateCreated: '2026-09-20T09:00:00Z' };
  const EP_ORPHAN = { Id: '3'.repeat(32), Name: 'Has Fallen - S02E03', Type: 'Episode', ServerId: 'srv', DateCreated: '2026-09-19T09:00:00Z', ImageTags: {}, ParentPrimaryImageItemId: 'd'.repeat(32) };

  function library() {
    return stub({
      'includeItemTypes=Movie&': () => res({ Items: [MOVIE_NEW, MOVIE_NO_POSTER] }),
      'includeItemTypes=Episode': () => res({ Items: [EP_A2, EP_A1, EP_ORPHAN] }),
    });
  }

  it('recentlyAddedSplit maps movies and collapses episodes to one entry per series', async () => {
    const split = await createJellyfinProvider(CFG, library()).recentlyAddedSplit(15);
    expect(split.movies).toEqual([
      {
        title: 'The Way',
        thumbPath: `jellyfin:${'a'.repeat(32)}`,
        addedAt: '2026-09-18T13:47:40.8231662Z',
        type: 'movie',
        webUrl: `http://jellyfin.local:8096/web/index.html#/details?id=${'a'.repeat(32)}&serverId=srv`,
      },
      {
        title: 'Plain',
        thumbPath: '',
        addedAt: '2026-09-15T09:07:19Z',
        type: 'movie',
        webUrl: `http://jellyfin.local:8096/web/index.html#/details?id=${'b'.repeat(32)}&serverId=srv`,
      },
    ]);
    expect(split.episodes.map((e) => e.title)).toEqual(['Futurama', 'Has Fallen - S02E03']);
    // One Futurama entry (the newest), poster = the season image, link = the season.
    expect(split.episodes[0]).toMatchObject({
      type: 'episode',
      addedAt: '2026-09-21T09:00:00Z',
      thumbPath: `jellyfin:${'e'.repeat(32)}`,
      webUrl: `http://jellyfin.local:8096/web/index.html#/details?id=${'e'.repeat(32)}&serverId=srv`,
    });
    // An episode with no series info falls back to its name and its parent's image.
    expect(split.episodes[1]).toMatchObject({ thumbPath: `jellyfin:${'d'.repeat(32)}` });
  });

  it('recentlyAddedSplit asks for a generous raw batch per type and slices to the requested count', async () => {
    const fetchFn = library();
    const split = await createJellyfinProvider(CFG, fetchFn).recentlyAddedSplit(1);
    expect(split.movies).toHaveLength(1);
    expect(split.episodes).toHaveLength(1);
    expect(urls(fetchFn).some((u) => u.includes('limit=50'))).toBe(true);
  });

  it('recentlyAdded merges both types, newest first, and slices', async () => {
    const items = await createJellyfinProvider(CFG, library()).recentlyAdded(2);
    expect(items.map((i) => i.title)).toEqual(['Futurama', 'Has Fallen - S02E03']);
  });

  it('search maps movies and series and returns [] for an empty query without fetching', async () => {
    const fetchFn = stub({
      '/Items?searchTerm=': () =>
        res({
          Items: [
            { Id: 'f'.repeat(32), Name: 'Futurama', Type: 'Series', ServerId: 'srv', ProductionYear: 1999, ImageTags: { Primary: 't' } },
            { Id: 'a'.repeat(32), Name: 'Future World', Type: 'Movie', ServerId: 'srv', ProductionYear: 2018, ImageTags: {} },
          ],
        }),
    });
    const p = createJellyfinProvider(CFG, fetchFn);
    expect(await p.search('   ')).toEqual([]);
    expect(urls(fetchFn)).toHaveLength(0);
    expect(await p.search('futu')).toEqual([
      {
        title: 'Futurama',
        year: 1999,
        type: 'show',
        thumbPath: `jellyfin:${'f'.repeat(32)}`,
        webUrl: `http://jellyfin.local:8096/web/index.html#/details?id=${'f'.repeat(32)}&serverId=srv`,
      },
      {
        title: 'Future World',
        year: 2018,
        type: 'movie',
        thumbPath: null,
        webUrl: `http://jellyfin.local:8096/web/index.html#/details?id=${'a'.repeat(32)}&serverId=srv`,
      },
    ]);
  });
});

describe('createJellyfinProvider: posters', () => {
  it('handles only valid jellyfin refs', () => {
    const p = createJellyfinProvider(CFG, stub({}));
    expect(p.handlesPoster(`jellyfin:${UID}`)).toBe(true);
    expect(p.handlesPoster('jellyfin:../x')).toBe(false);
    expect(p.handlesPoster('/library/metadata/1/thumb/1')).toBe(false);
  });

  it('poster fetches the resized primary image', async () => {
    const fetchFn = vi.fn(
      async () => new Response(new Uint8Array([7]), { status: 200, headers: { 'Content-Type': 'image/jpeg' } })
    ) as unknown as typeof fetch;
    const result = await createJellyfinProvider(CFG, fetchFn).poster(`jellyfin:${UID}`);
    expect(result?.contentType).toBe('image/jpeg');
    expect(urls(fetchFn)[0]).toContain(`/Items/${UID}/Images/Primary?maxWidth=300`);
  });

  it('poster returns null for a foreign ref without fetching', async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch;
    expect(await createJellyfinProvider(CFG, fetchFn).poster('/library/metadata/1/thumb/1')).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
