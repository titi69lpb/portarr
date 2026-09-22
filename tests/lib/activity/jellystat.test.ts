import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  listMemberActivity,
  getUserHistoryPage,
  getMostViewedByType,
  getMostPopularByType,
  getMostViewedLibraries,
  getMostActiveUsers,
  getJellystatSessionsRaw,
} from '../../../src/lib/activity/jellystat';
import { resetTtlCacheForTests } from '../../../src/lib/ttl-cache';

const CFG = { url: 'http://jellystat.local:3000', apiKey: 'js-key' };
const UID = 'a'.repeat(32);

beforeEach(() => {
  resetTtlCacheForTests();
});

function res(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, statusText: status === 200 ? 'OK' : 'Error', json: async () => body } as unknown as Response;
}

function calls(fetchFn: typeof fetch) {
  return (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls as Array<[string, RequestInit]>;
}

describe('listMemberActivity', () => {
  it('sends the api key header and maps rows, caching the result', async () => {
    const fetchFn = vi.fn(async () =>
      res([{ UserId: UID, UserName: 'alice', LastActivityDate: '2026-05-18T13:53:12.541Z', TotalPlays: 7, TotalWatchTime: 10046 }])
    ) as unknown as typeof fetch;
    const activity = await listMemberActivity(CFG, fetchFn);
    expect(activity).toEqual([{ userId: UID, lastSeenAt: '2026-05-18T13:53:12.541Z' }]);
    const [url, init] = calls(fetchFn)[0];
    expect(url).toBe('http://jellystat.local:3000/stats/getAllUserActivity');
    expect((init.headers as Record<string, string>)['x-api-token']).toBe('js-key');

    await listMemberActivity(CFG, fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('handles a member with no activity date', async () => {
    const fetchFn = vi.fn(async () => res([{ UserId: UID, UserName: 'alice', LastActivityDate: null }])) as unknown as typeof fetch;
    expect(await listMemberActivity(CFG, fetchFn)).toEqual([{ userId: UID, lastSeenAt: null }]);
  });

  it('throws with the status when Jellystat answers non-ok', async () => {
    const fetchFn = vi.fn(async () => res({}, 401)) as unknown as typeof fetch;
    await expect(listMemberActivity(CFG, fetchFn)).rejects.toThrow('Jellystat API request failed: 401');
  });
});

describe('getUserHistoryPage', () => {
  it('posts userid and paging params and maps results, sorted newest first', async () => {
    const fetchFn = vi.fn(async () =>
      res({
        current_page: 1,
        pages: 3,
        size: 2,
        results: [
          {
            NowPlayingItemName: 'Out East',
            SeriesName: 'Your Friends & Neighbors',
            SeasonId: 'e'.repeat(32),
            EpisodeId: 'f'.repeat(32),
            EpisodeNumber: 7,
            SeasonNumber: 2,
            FullName: 'Your Friends & Neighbors : S2E7 - Out East',
            ActivityDateInserted: '2026-05-18T13:53:12.541Z',
            PlaybackDuration: 3329,
          },
          {
            NowPlayingItemName: 'The Way',
            SeriesName: null,
            NowPlayingItemId: 'g'.repeat(32),
            FullName: 'The Way',
            ActivityDateInserted: '2026-05-17T09:00:00.000Z',
            PlaybackDuration: 6000,
          },
        ],
      })
    ) as unknown as typeof fetch;
    const page = await getUserHistoryPage(CFG, UID, 1, 2, fetchFn);
    expect(page).toEqual({
      items: [
        { title: 'Your Friends & Neighbors : S2E7 - Out East', type: 'episode', thumbPath: `jellyfin:${'e'.repeat(32)}`, watchedAt: '2026-05-18T13:53:12.541Z' },
        { title: 'The Way', type: 'movie', thumbPath: `jellyfin:${'g'.repeat(32)}`, watchedAt: '2026-05-17T09:00:00.000Z' },
      ],
      total: 6, // pages(3) * size(2) — see comment below
    });
    const [url, init] = calls(fetchFn)[0];
    expect(url).toBe('http://jellystat.local:3000/api/getUserHistory?size=2&page=1&sort=ActivityDateInserted&desc=true');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ userid: UID });
  });
});

describe('the four box-office queries', () => {
  it('getMostViewedByType maps Name/Plays/Id and sends days=365 with the requested type', async () => {
    const fetchFn = vi.fn(async () => res([{ Name: 'The Way', Plays: 5, Id: 'h'.repeat(32) }])) as unknown as typeof fetch;
    expect(await getMostViewedByType(CFG, 'Movie', fetchFn)).toEqual([{ title: 'The Way', value: 5, posterPath: `jellyfin:${'h'.repeat(32)}` }]);
    const [url, init] = calls(fetchFn)[0];
    expect(url).toBe('http://jellystat.local:3000/stats/getMostViewedByType');
    expect(JSON.parse(init.body as string)).toEqual({ days: 365, type: 'Movie' });
  });

  it('getMostPopularByType maps Name/unique_viewers/Id', async () => {
    const fetchFn = vi.fn(async () => res([{ Name: 'The Way', unique_viewers: 3, Id: 'h'.repeat(32) }])) as unknown as typeof fetch;
    expect(await getMostPopularByType(CFG, 'Movie', fetchFn)).toEqual([{ title: 'The Way', value: 3, posterPath: `jellyfin:${'h'.repeat(32)}` }]);
  });

  it('getMostViewedLibraries maps Name/Plays with no poster', async () => {
    const fetchFn = vi.fn(async () => res([{ Name: 'Séries', Plays: 5 }])) as unknown as typeof fetch;
    expect(await getMostViewedLibraries(CFG, fetchFn)).toEqual([{ title: 'Séries', value: 5 }]);
  });

  it('getMostActiveUsers maps Name/Plays with no poster', async () => {
    const fetchFn = vi.fn(async () => res([{ Name: 'alice', Plays: 7, UserId: UID }])) as unknown as typeof fetch;
    expect(await getMostActiveUsers(CFG, fetchFn)).toEqual([{ title: 'alice', value: 7 }]);
  });
});

describe('getJellystatSessionsRaw', () => {
  it('proxies /proxy/getSessions and returns the raw array untouched', async () => {
    const raw = [{ UserName: 'alice', NowPlayingItem: { Id: UID } }];
    const fetchFn = vi.fn(async () => res(raw)) as unknown as typeof fetch;
    expect(await getJellystatSessionsRaw(CFG, fetchFn)).toEqual(raw);
    const [url] = calls(fetchFn)[0];
    expect(url).toBe('http://jellystat.local:3000/proxy/getSessions');
  });
});
