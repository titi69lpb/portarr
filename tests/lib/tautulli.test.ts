import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getPersonalStats,
  getUserActivity,
  getExtendedStats,
  getPersonalStatsByType,
  getUserIdByEmail,
  getRecentWatchHistory,
  getWatchHistoryPage,
} from '../../src/lib/tautulli';
import { resetTtlCacheForTests } from '../../src/lib/ttl-cache';

// All of the above are now cached (DEFAULT_CACHE_TTL_MS) — without this, a test
// running after another that hit the same underlying endpoint (get_users_table
// in particular, shared by 3 of these functions) would see stale mocked data.
beforeEach(() => {
  resetTtlCacheForTests();
});

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 400, json: async () => body } as Response;
}

function errorResponse(status: number, statusText: string = 'Error') {
  return {
    ok: false,
    status,
    statusText,
    json: async () => ({}),
  } as Response;
}

describe('getPersonalStats', () => {
  it('returns null without querying the match when the email is empty', async () => {
    const usersTable = { response: { data: { data: [{ email: '', plays: 999, duration: 999 }] } } };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(usersTable));
    const result = await getPersonalStats('https://tautulli.example.com', 'apikey', '', fetchMock);
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null when the email has no match', async () => {
    const usersTable = { response: { data: { data: [{ email: 'other@example.com', plays: 5, duration: 100 }] } } };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(usersTable));
    const result = await getPersonalStats(
      'https://tautulli.example.com',
      'apikey',
      'me@example.com',
      fetchMock
    );
    expect(result).toBeNull();
  });

  it('returns plays and duration for a matching email', async () => {
    const usersTable = {
      response: { data: { data: [{ email: 'me@example.com', plays: 12, duration: 3600 }] } },
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(usersTable));
    const result = await getPersonalStats(
      'https://tautulli.example.com',
      'apikey',
      'me@example.com',
      fetchMock
    );
    expect(result).toEqual({ plays: 12, totalDurationSeconds: 3600 });
  });

  it('throws when the API returns an error status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errorResponse(403, 'Forbidden'));
    await expect(
      getPersonalStats('https://tautulli.example.com', 'apikey', 'me@example.com', fetchMock)
    ).rejects.toThrow('Tautulli API request failed: 403 Forbidden');
  });
});

describe('getUserActivity', () => {
  it('maps last_seen to a Date, lowercases email', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: {
          data: {
            data: [
              { email: 'Alice@Example.com', last_seen: 1735689600 },
              { email: 'bob@example.com', last_seen: null },
            ],
          },
        },
      }),
    });
    const result = await getUserActivity('https://tautulli.local', 'key', fetchFn as unknown as typeof fetch);
    expect(result).toEqual([
      { email: 'alice@example.com', lastSeenAt: new Date(1735689600 * 1000) },
      { email: 'bob@example.com', lastSeenAt: null },
    ]);
  });

  it('skips rows with no email', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: { data: { data: [{ last_seen: 123 }] } },
      }),
    });
    const result = await getUserActivity('https://tautulli.local', 'key', fetchFn as unknown as typeof fetch);
    expect(result).toEqual([]);
  });

  it('throws a descriptive error when the request fails', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Server Error' });
    await expect(
      getUserActivity('https://tautulli.local', 'key', fetchFn as unknown as typeof fetch)
    ).rejects.toThrow(/Tautulli API request failed/);
  });
});

describe('getExtendedStats', () => {
  it('requests a wide time_range, since movie plays are infrequent enough that a short default window returns empty categories', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: [] } }),
    });

    await getExtendedStats('https://tautulli.example.com', 'key', fetchMock);

    expect(fetchMock.mock.calls[0][0]).toContain('time_range=365');
  });

  it('maps all 8 stat_id blocks into their respective categories', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: {
          data: [
            { stat_id: 'top_movies', rows: [{ title: 'Movie A', users_watched: 5, total_plays: 5 }] },
            { stat_id: 'popular_movies', rows: [{ title: 'Movie B', users_watched: 3, total_plays: 3 }] },
            { stat_id: 'top_tv', rows: [{ title: 'Show A', users_watched: 8, total_plays: 8 }] },
            { stat_id: 'popular_tv', rows: [{ title: 'Show B', users_watched: 6, total_plays: 6 }] },
            { stat_id: 'top_libraries', rows: [{ section_name: 'Films', total_plays: 42 }] },
            { stat_id: 'top_users', rows: [{ friendly_name: 'Alice', total_plays: 12 }] },
            { stat_id: 'top_platforms', rows: [{ platform_name: 'Chrome', total_plays: 20 }] },
            { stat_id: 'most_concurrent', rows: [{ title: 'Aug 1', count: 4 }] },
          ],
        },
      }),
    });

    const result = await getExtendedStats('https://tautulli.example.com', 'key', fetchMock);

    expect(result).toEqual({
      topMovies: [{ title: 'Movie A', value: 5 }],
      popularMovies: [{ title: 'Movie B', value: 3 }],
      topTv: [{ title: 'Show A', value: 8 }],
      popularTv: [{ title: 'Show B', value: 6 }],
      topLibraries: [{ title: 'Films', value: 42 }],
      topUsers: [{ title: 'Alice', value: 12 }],
      topPlatforms: [{ title: 'Chrome', value: 20 }],
      mostConcurrent: [{ title: 'Aug 1', value: 4 }],
    });
  });

  it('returns empty arrays for missing blocks rather than throwing', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: [] } }),
    });

    const result = await getExtendedStats('https://tautulli.example.com', 'key', fetchMock);

    expect(result.topMovies).toEqual([]);
    expect(result.mostConcurrent).toEqual([]);
  });

  it('picks users_watched (not total_plays) for popular_tv/popular_movies when a row has both fields with different values', async () => {
    // Regression test: a real Tautulli popular_tv row carries BOTH total_plays and
    // users_watched simultaneously. popularTv/popularMovies must report users_watched,
    // not total_plays.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: {
          data: [
            {
              stat_id: 'popular_tv',
              rows: [{ title: 'Reacher', total_plays: 10, users_watched: 4 }],
            },
            {
              stat_id: 'popular_movies',
              rows: [{ title: 'Dune', total_plays: 25, users_watched: 7 }],
            },
            {
              stat_id: 'top_movies',
              rows: [{ title: 'Oppenheimer', total_plays: 30, users_watched: 9 }],
            },
          ],
        },
      }),
    });

    const result = await getExtendedStats('https://tautulli.example.com', 'key', fetchMock);

    expect(result.popularTv).toEqual([{ title: 'Reacher', value: 4 }]);
    expect(result.popularMovies).toEqual([{ title: 'Dune', value: 7 }]);
    expect(result.topMovies).toEqual([{ title: 'Oppenheimer', value: 30 }]);
  });

  it('captures posterPath for media categories only, using thumb or grandparent_thumb', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: {
          data: [
            {
              stat_id: 'top_movies',
              rows: [{ title: 'Movie A', total_plays: 5, thumb: '/library/metadata/1/thumb/1', grandparent_thumb: '' }],
            },
            {
              stat_id: 'top_tv',
              rows: [{ title: 'Show A', total_plays: 8, thumb: '', grandparent_thumb: '/library/metadata/2/thumb/2' }],
            },
            {
              stat_id: 'top_users',
              rows: [{ friendly_name: 'Alice', total_plays: 12, thumb: '/library/metadata/3/thumb/3' }],
            },
          ],
        },
      }),
    });

    const result = await getExtendedStats('https://tautulli.example.com', 'key', fetchMock);

    expect(result.topMovies[0].posterPath).toBe('/library/metadata/1/thumb/1');
    expect(result.topTv[0].posterPath).toBe('/library/metadata/2/thumb/2');
    expect(result.topUsers[0].posterPath).toBeUndefined();
  });

  it('resolves the real title, not an empty string, when the row carries every title-ish field but only one is non-empty (real Tautulli shape)', async () => {
    // Regression test: live Tautulli home_stats rows carry section_name,
    // friendly_name, platform_name, AND title on every row, all four keys
    // present, but empty string ('') on whichever don't apply to that row's
    // category. rowToStat used to chain these with `??`, which only skips
    // null/undefined — it stopped at the first *present* key (friendly_name:
    // '') and returned an empty title, even though the real title was sitting
    // right there in `title`. This is exactly what "Box Office" showed in
    // production: posters loaded, values loaded, but every title was blank.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: {
          data: [
            {
              stat_id: 'top_tv',
              rows: [
                {
                  title: 'Tulsa King',
                  total_plays: 111,
                  users_watched: '',
                  friendly_name: '',
                  section_name: undefined,
                  platform_name: undefined,
                  thumb: '/library/metadata/14795/thumb/1774730340',
                  grandparent_thumb: '/library/metadata/14795/thumb/1774730340',
                },
              ],
            },
          ],
        },
      }),
    });

    const result = await getExtendedStats('https://tautulli.example.com', 'key', fetchMock);

    expect(result.topTv[0].title).toBe('Tulsa King');
  });

  it('defaults value to 0 when a row is missing its value field entirely', async () => {
    // Regression test: rowToStat must fall back at runtime, not just claim `number`
    // via a type cast — a row missing its value field should render as 0, not undefined.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: {
          data: [{ stat_id: 'most_concurrent', rows: [{ title: 'Aug 1' }] }],
        },
      }),
    });

    const result = await getExtendedStats('https://tautulli.example.com', 'key', fetchMock);

    expect(result.mostConcurrent).toEqual([{ title: 'Aug 1', value: 0 }]);
  });
});

describe('getPersonalStatsByType', () => {
  it('splits count and watch time between movies and episodes', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('media_type=movie')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            response: { data: { recordsFiltered: 2, data: [{ duration: 3600 }, { duration: 1800 }] } },
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          response: { data: { recordsFiltered: 3, data: [{ duration: 1200 }, { duration: 1200 }, { duration: 1200 }] } },
        }),
      });
    });

    const result = await getPersonalStatsByType('https://tautulli.example.com', 'key', 42, fetchMock);

    expect(result).toEqual({
      movies: { count: 2, hours: 1.5 },
      episodes: { count: 3, hours: 1 },
    });
  });

  it('returns zeroed values when one of the two calls fails, without throwing', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('media_type=movie')) {
        return Promise.resolve({ ok: false, status: 500 });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          response: { data: { recordsFiltered: 1, data: [{ duration: 3600 }] } },
        }),
      });
    });

    const result = await getPersonalStatsByType('https://tautulli.example.com', 'key', 42, fetchMock);

    expect(result).toEqual({
      movies: { count: 0, hours: 0 },
      episodes: { count: 1, hours: 1 },
    });
  });

  it('zeroes out one media type when its response body has an unexpected shape (e.g. Tautulli error convention), without throwing, while the other media type still resolves correctly', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('media_type=movie')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ response: { result: 'error', message: 'Invalid user_id' } }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          response: { data: { recordsFiltered: 1, data: [{ duration: 3600 }] } },
        }),
      });
    });

    const result = await getPersonalStatsByType('https://tautulli.example.com', 'key', 42, fetchMock);

    expect(result).toEqual({
      movies: { count: 0, hours: 0 },
      episodes: { count: 1, hours: 1 },
    });
  });

  it('extrapolates hours when recordsFiltered exceeds the number of rows actually returned', async () => {
    // Regression test: Tautulli's get_history is capped at length=500, but recordsFiltered
    // reports the true total. When the cap truncates the sample, hours must be scaled up
    // to stay consistent with the exact `count`, not just sum the returned rows' durations.
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('media_type=movie')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            response: { data: { recordsFiltered: 1000, data: [{ duration: 3600 }, { duration: 1800 }] } },
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          response: { data: { recordsFiltered: 3, data: [{ duration: 1200 }, { duration: 1200 }, { duration: 1200 }] } },
        }),
      });
    });

    const result = await getPersonalStatsByType('https://tautulli.example.com', 'key', 42, fetchMock);

    // avg duration of the 2 sample rows = 2700s; scaled over 1000 records = 2,700,000s = 750h
    expect(result.movies).toEqual({ count: 1000, hours: 750 });
    expect(result.episodes).toEqual({ count: 3, hours: 1 });
  });
});

describe('getUserIdByEmail', () => {
  it('returns null without querying the match when the email is empty', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ response: { data: { data: [{ email: 'me@example.com', user_id: 1 }] } } })
    );
    const result = await getUserIdByEmail('https://tautulli.example.com', 'apikey', '', fetchMock);
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null when the email has no match', async () => {
    const usersTable = { response: { data: { data: [{ email: 'other@example.com', user_id: 7 }] } } };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(usersTable));
    const result = await getUserIdByEmail(
      'https://tautulli.example.com',
      'apikey',
      'me@example.com',
      fetchMock
    );
    expect(result).toBeNull();
  });

  it('returns the user_id for a matching email', async () => {
    const usersTable = { response: { data: { data: [{ email: 'Me@Example.com', user_id: 42 }] } } };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(usersTable));
    const result = await getUserIdByEmail(
      'https://tautulli.example.com',
      'apikey',
      'me@example.com',
      fetchMock
    );
    expect(result).toBe(42);
  });
});

describe('getRecentWatchHistory', () => {
  it('maps movie and episode rows, using full_title for episodes', async () => {
    const history = {
      response: {
        data: {
          data: [
            {
              media_type: 'episode',
              title: 'Refoulements',
              full_title: 'The White Lotus - Refoulements',
              grandparent_title: 'The White Lotus',
              thumb: '/library/metadata/27317/thumb/1786975000',
              date: 1788039585,
            },
            {
              media_type: 'movie',
              title: 'Fight Club',
              thumb: '/library/metadata/40425/thumb/1',
              date: 1788035871,
            },
          ],
        },
      },
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(history));
    const result = await getRecentWatchHistory(
      'https://tautulli.example.com',
      'apikey',
      42,
      8,
      fetchMock
    );
    expect(result).toEqual([
      {
        title: 'The White Lotus - Refoulements',
        type: 'episode',
        thumbPath: '/library/metadata/27317/thumb/1786975000',
        watchedAt: new Date(1788039585 * 1000).toISOString(),
      },
      {
        title: 'Fight Club',
        type: 'movie',
        thumbPath: '/library/metadata/40425/thumb/1',
        watchedAt: new Date(1788035871 * 1000).toISOString(),
      },
    ]);
  });

  it('skips rows without a thumb and rows of other media types', async () => {
    const history = {
      response: {
        data: {
          data: [
            { media_type: 'movie', title: 'No Thumb', date: 1 },
            { media_type: 'track', title: 'A Song', thumb: '/library/metadata/1/thumb/1', date: 1 },
          ],
        },
      },
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(history));
    const result = await getRecentWatchHistory(
      'https://tautulli.example.com',
      'apikey',
      42,
      8,
      fetchMock
    );
    expect(result).toEqual([]);
  });

  it('returns an empty array when the API request fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errorResponse(500, 'Server Error'));
    const result = await getRecentWatchHistory(
      'https://tautulli.example.com',
      'apikey',
      42,
      8,
      fetchMock
    );
    expect(result).toEqual([]);
  });

  it('returns an empty array when the response body is malformed', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ unexpected: true }) });
    const result = await getRecentWatchHistory(
      'https://tautulli.example.com',
      'apikey',
      42,
      8,
      fetchMock
    );
    expect(result).toEqual([]);
  });
});

describe('getWatchHistoryPage', () => {
  it('requests the given offset/length and returns items alongside the total count', async () => {
    const history = {
      response: {
        data: {
          recordsFiltered: 57,
          data: [{ media_type: 'movie', title: 'Fight Club', thumb: '/thumb/1', date: 1788035871 }],
        },
      },
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(history));
    const result = await getWatchHistoryPage('https://tautulli.example.com', 'apikey', 42, 30, 30, fetchMock);

    expect(result.total).toBe(57);
    expect(result.items).toEqual([
      {
        title: 'Fight Club',
        type: 'movie',
        thumbPath: '/thumb/1',
        watchedAt: new Date(1788035871 * 1000).toISOString(),
      },
    ]);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('start=30');
    expect(url).toContain('length=30');
  });

  it('filters out rows without a thumb, same as getRecentWatchHistory', async () => {
    const history = {
      response: {
        data: {
          recordsFiltered: 1,
          data: [{ media_type: 'movie', title: 'No Thumb', date: 1 }],
        },
      },
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(history));
    const result = await getWatchHistoryPage('https://tautulli.example.com', 'apikey', 42, 0, 30, fetchMock);
    expect(result.items).toEqual([]);
  });

  it('throws (does not swallow) when the API request fails — the /api/history route turns this into a 502', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errorResponse(500, 'Server Error'));
    await expect(
      getWatchHistoryPage('https://tautulli.example.com', 'apikey', 42, 0, 30, fetchMock)
    ).rejects.toThrow('Tautulli API request failed: 500 Server Error');
  });

  it('is not TTL-cached — two calls at the same offset both hit Tautulli', async () => {
    const history = {
      response: { data: { recordsFiltered: 1, data: [] } },
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(history));
    await getWatchHistoryPage('https://tautulli.example.com', 'apikey', 42, 0, 30, fetchMock);
    await getWatchHistoryPage('https://tautulli.example.com', 'apikey', 42, 0, 30, fetchMock);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
