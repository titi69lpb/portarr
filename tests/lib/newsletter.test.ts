import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getNewsletterItems } from '../../src/lib/newsletter';
import { resetTtlCacheForTests } from '../../src/lib/ttl-cache';

// getNewsletterItems delegates to getRecentlyAdded, which is now cached — every
// test here uses the same (plexUrl, count), so without this a later test would
// silently reuse an earlier test's mocked Hub response.
beforeEach(() => {
  resetTtlCacheForTests();
});

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body } as Response;
}

// getNewsletterItems delegates to getRecentlyAdded, which fans out to two Hub
// calls (type=1 movies, type=2 TV) via Promise.all and reads JSON
// (MediaContainer.Metadata) — route each mock response by the requested
// `type` query param rather than call order. Mirrors the hubFetchMock helper
// in tests/lib/plex.test.ts.
function hubFetchMock(movies: Record<string, unknown>[], tv: Record<string, unknown>[]) {
  return vi.fn().mockImplementation((url: string) => {
    const isMovies = url.includes('type=1');
    return Promise.resolve(jsonResponse({ MediaContainer: { Metadata: isMovies ? movies : tv } }));
  });
}

describe('getNewsletterItems', () => {
  it('splits movies and episodes, filters by window', async () => {
    const now = Date.now();
    const recentAddedAt = Math.floor((now - 2 * 24 * 60 * 60 * 1000) / 1000);
    const oldAddedAt = Math.floor((now - 30 * 24 * 60 * 60 * 1000) / 1000);
    const movies = [
      { title: 'Recent Movie', thumb: '/library/metadata/1/thumb/1', addedAt: recentAddedAt, type: 'movie' },
      { title: 'Old Movie', thumb: '/library/metadata/2/thumb/2', addedAt: oldAddedAt, type: 'movie' },
    ];
    const tv = [
      {
        title: 'Recent Episode',
        grandparentTitle: 'Recent Episode',
        parentThumb: '/library/metadata/3/thumb/3',
        addedAt: recentAddedAt,
        type: 'episode',
      },
    ];
    const fetchMock = hubFetchMock(movies, tv);
    const result = await getNewsletterItems('https://plex.example.com', 'server-token', 6, fetchMock);
    expect(result.movies.map((m) => m.title)).toEqual(['Recent Movie']);
    expect(result.episodes.map((e) => e.title)).toEqual(['Recent Episode']);
  });

  it('returns empty lists when nothing is within the window', async () => {
    const oldAddedAt = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
    const movies = [{ title: 'Old Movie', thumb: '/library/metadata/1/thumb/1', addedAt: oldAddedAt, type: 'movie' }];
    const fetchMock = hubFetchMock(movies, []);
    const result = await getNewsletterItems('https://plex.example.com', 'server-token', 6, fetchMock);
    expect(result).toEqual({ movies: [], episodes: [] });
  });

  it('excludes items with no thumb (thumbPath would be the literal string "undefined")', async () => {
    const recentAddedAt = Math.floor((Date.now() - 2 * 24 * 60 * 60 * 1000) / 1000);
    const movies = [
      { title: 'Has Thumb', thumb: '/library/metadata/1/thumb/1', addedAt: recentAddedAt, type: 'movie' },
      { title: 'No Thumb', addedAt: recentAddedAt, type: 'movie' },
    ];
    const fetchMock = hubFetchMock(movies, []);
    const result = await getNewsletterItems('https://plex.example.com', 'server-token', 6, fetchMock);
    expect(result.movies.map((m) => m.title)).toEqual(['Has Thumb']);
  });
});
