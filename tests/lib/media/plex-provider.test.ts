import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPlexProvider } from '../../../src/lib/media/plex-provider';
import { resetTtlCacheForTests } from '../../../src/lib/ttl-cache';

const CFG = {
  url: 'http://plex.local:32400',
  serverToken: 'tok',
  serverName: 'MyPlex',
  clientIdentifier: 'cid',
};

beforeEach(() => {
  resetTtlCacheForTests();
});

function json(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as Response;
}

function xml(body: string): Response {
  return { ok: true, status: 200, text: async () => body } as Response;
}

const USERS_XML =
  '<MediaContainer><User id="5" email="a@b.com" username="al"><Server name="MyPlex"/></User></MediaContainer>';

function fetchStub(routes: Record<string, () => Response>): typeof fetch {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    const hit = Object.keys(routes).find((fragment) => url.includes(fragment));
    if (!hit) throw new Error(`unexpected fetch: ${url}`);
    return routes[hit]();
  }) as unknown as typeof fetch;
}

describe('createPlexProvider', () => {
  it('identifies itself as the plex pin-auth provider', () => {
    const p = createPlexProvider(CFG, fetchStub({}));
    expect(p.id).toBe('plex');
    expect(p.displayName).toBe('Plex');
    expect(p.auth.kind).toBe('pin');
  });

  it('createPin returns only pinId and authUrl', async () => {
    const p = createPlexProvider(CFG, fetchStub({ '/api/v2/pins': () => json({ id: 7, code: 'ABCD' }) }));
    expect(await p.auth.createPin()).toEqual({
      pinId: 7,
      authUrl: expect.stringContaining('code=ABCD'),
    });
  });

  it('listMembers returns provider-tagged members for this server only', async () => {
    const p = createPlexProvider(CFG, fetchStub({ 'plex.tv/api/users': () => xml(USERS_XML) }));
    expect(await p.listMembers()).toEqual([
      { provider: 'plex', userId: '5', email: 'a@b.com', username: 'al' },
    ]);
  });

  it('isMember is true for a shared user and false for a stranger', async () => {
    const p = createPlexProvider(CFG, fetchStub({ 'plex.tv/api/users': () => xml(USERS_XML) }));
    expect(await p.isMember('5')).toBe(true);
    expect(await p.isMember('6')).toBe(false);
  });

  it('isMember fails open when plex.tv is unreachable', async () => {
    const failing = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await createPlexProvider(CFG, failing).isMember('5')).toBe(true);
  });

  it('search returns library results with a web deep link', async () => {
    const p = createPlexProvider(
      CFG,
      fetchStub({
        '/hubs/search': () =>
          json({ MediaContainer: { Hub: [{ type: 'movie', Metadata: [{ title: 'Dune', year: 2021, thumb: '/t', ratingKey: '9' }] }] } }),
        '/identity': () => json({ MediaContainer: { machineIdentifier: 'MID' } }),
      })
    );
    expect(await p.search('dune')).toEqual([
      {
        title: 'Dune',
        year: 2021,
        type: 'movie',
        thumbPath: '/t',
        webUrl: expect.stringContaining('/web/index.html#!/server/MID/details'),
      },
    ]);
  });

  it('recentlyAddedSplit separates movies from episodes', async () => {
    const p = createPlexProvider(
      CFG,
      fetchStub({
        'type=1': () => json({ MediaContainer: { Metadata: [{ title: 'Dune', thumb: '/m', addedAt: 1700000000, ratingKey: '1' }] } }),
        'type=2': () =>
          json({
            MediaContainer: {
              Metadata: [
                { type: 'episode', grandparentTitle: 'Show', parentThumb: '/s', thumb: '/e', addedAt: 1700000100, parentRatingKey: '9', ratingKey: '10' },
              ],
            },
          }),
        '/identity': () => json({ MediaContainer: { machineIdentifier: 'MID' } }),
      })
    );
    const split = await p.recentlyAddedSplit(15);
    expect(split.movies.map((i) => i.title)).toEqual(['Dune']);
    expect(split.episodes.map((i) => i.title)).toEqual(['Show']);
  });
});
