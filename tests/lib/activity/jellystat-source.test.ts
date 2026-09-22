import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createJellystatActivitySource } from '../../../src/lib/activity/jellystat-source';
import { resetTtlCacheForTests } from '../../../src/lib/ttl-cache';

const CFG = { url: 'http://jellystat.local:3000', apiKey: 'js-key' };
const UID = 'a'.repeat(32);
const MEMBER = { provider: 'jellyfin' as const, userId: UID, email: '', username: 'alice' };

beforeEach(() => {
  resetTtlCacheForTests();
});

function res(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

function routed(routes: Record<string, () => Response>): typeof fetch {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    const hit = Object.keys(routes).find((fragment) => url.includes(fragment));
    if (!hit) throw new Error(`unexpected fetch: ${url}`);
    return routes[hit]();
  }) as unknown as typeof fetch;
}

describe('createJellystatActivitySource', () => {
  it('identifies itself as the jellyfin source', () => {
    expect(createJellystatActivitySource(CFG, vi.fn()).id).toBe('jellyfin');
  });

  it('lastSeen matches the member by Jellyfin id', async () => {
    const fetchFn = routed({
      '/stats/getAllUserActivity': () => res([{ UserId: UID, LastActivityDate: '2026-05-18T13:53:12.541Z' }]),
    });
    const source = createJellystatActivitySource(CFG, fetchFn);
    expect(await source.lastSeen(MEMBER)).toBe('2026-05-18T13:53:12.541Z');
    expect(await source.lastSeen({ ...MEMBER, userId: 'b'.repeat(32) })).toBeNull();
  });

  it('recentHistory returns the first page of the member history, limited', async () => {
    const fetchFn = routed({
      '/api/getUserHistory': () =>
        res({ pages: 1, size: 8, results: [{ NowPlayingItemName: 'The Way', NowPlayingItemId: 'h'.repeat(32), ActivityDateInserted: '2026-05-17T09:00:00.000Z', FullName: 'The Way' }] }),
    });
    const source = createJellystatActivitySource(CFG, fetchFn);
    expect(await source.recentHistory(MEMBER, 8)).toEqual([
      { title: 'The Way', type: 'movie', thumbPath: `jellyfin:${'h'.repeat(32)}`, watchedAt: '2026-05-17T09:00:00.000Z' },
    ]);
  });

  it('historyPage forwards offset/limit as a 1-based page number', async () => {
    const fetchFn = routed({ '/api/getUserHistory': () => res({ pages: 2, size: 30, results: [] }) });
    const source = createJellystatActivitySource(CFG, fetchFn);
    await source.historyPage(MEMBER, 30, 30);
    const [url, init] = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('page=2');
    expect(url).toContain('size=30');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ userid: UID });
  });

  it('personalStats derives plays/duration from the member activity row', async () => {
    const fetchFn = routed({
      '/stats/getAllUserActivity': () => res([{ UserId: UID, LastActivityDate: null, TotalPlays: 7, TotalWatchTime: 10046 }]),
    });
    const source = createJellystatActivitySource(CFG, fetchFn);
    expect(await source.personalStats(MEMBER)).toEqual({ plays: 7, totalDurationSeconds: 10046 });
    expect(await source.personalStats({ ...MEMBER, userId: 'b'.repeat(32) })).toBeNull();
  });

  it('personalStatsByType is a deliberate simplification — no per-type split confirmed for Jellystat, returns zeros', async () => {
    const source = createJellystatActivitySource(CFG, vi.fn());
    expect(await source.personalStatsByType(MEMBER)).toEqual({ movies: { count: 0, hours: 0 }, episodes: { count: 0, hours: 0 } });
  });

  it('nowPlaying reuses the shared Jellyfin session mapping on the proxied raw sessions', async () => {
    const fetchFn = routed({
      '/proxy/getSessions': () =>
        res([
          {
            UserName: 'alice',
            DeviceName: 'Living Room TV',
            NowPlayingItem: { Id: UID, Name: 'Some Movie', Type: 'Movie', ProductionYear: 2024, RunTimeTicks: 72000000000 },
            PlayState: { IsPaused: false, PositionTicks: 6000000000, PlayMethod: 'DirectPlay' },
          },
        ]),
    });
    const source = createJellystatActivitySource(CFG, fetchFn);
    const sessions = await source.nowPlaying();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ title: 'Some Movie', user: 'alice', posterPath: `jellyfin:${UID}` });
  });

  it('globalStats assembles all four box-office categories and leaves platforms/concurrent empty', async () => {
    const fetchFn = routed({
      '/stats/getMostViewedByType': () => res([{ Name: 'Movie A', Plays: 3, Id: 'h'.repeat(32) }]),
      '/stats/getMostPopularByType': () => res([{ Name: 'Movie A', unique_viewers: 2, Id: 'h'.repeat(32) }]),
      '/stats/getMostViewedLibraries': () => res([{ Name: 'Films', Plays: 4 }]),
      '/stats/getMostActiveUsers': () => res([{ Name: 'alice', Plays: 7 }]),
    });
    const source = createJellystatActivitySource(CFG, fetchFn);
    const stats = await source.globalStats();
    expect(stats.topMovies).toEqual([{ title: 'Movie A', value: 3, posterPath: `jellyfin:${'h'.repeat(32)}` }]);
    expect(stats.popularMovies).toEqual([{ title: 'Movie A', value: 2, posterPath: `jellyfin:${'h'.repeat(32)}` }]);
    expect(stats.topLibraries).toEqual([{ title: 'Films', value: 4 }]);
    expect(stats.topUsers).toEqual([{ title: 'alice', value: 7 }]);
    expect(stats.topPlatforms).toEqual([]);
    expect(stats.mostConcurrent).toEqual([]);
  });
});
