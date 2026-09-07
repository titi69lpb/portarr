import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getUpcomingReleases } from '../../src/lib/calendar';
import { resetTtlCacheForTests } from '../../src/lib/ttl-cache';

// getUpcomingReleases is now cached (DEFAULT_CACHE_TTL_MS) — without this, a
// test using the same (sonarr, radarr, start, end) as an earlier one would see
// that earlier test's mocked response instead of hitting its own mock.
beforeEach(() => {
  resetTtlCacheForTests();
});

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 400, json: async () => body } as Response;
}

describe('getUpcomingReleases', () => {
  it('requests the Sonarr calendar with includeSeries=true, since the series object is otherwise omitted', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse([])));

    await getUpcomingReleases(
      { url: 'https://sonarr.example.com', apiKey: 'skey' },
      { url: 'https://radarr.example.com', apiKey: 'rkey' },
      new Date('2026-09-01'),
      new Date('2026-09-07'),
      fetchMock
    );

    const sonarrCall = fetchMock.mock.calls.find(([url]) => url.includes('sonarr'));
    expect(sonarrCall?.[0]).toContain('includeSeries=true');
  });

  it('merges and sorts Sonarr episodes and Radarr movies by release date', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('sonarr')) {
        return Promise.resolve(
          jsonResponse([
            {
              series: { title: 'Some Show' },
              airDateUtc: '2026-09-03T00:00:00Z',
              hasFile: false,
              seasonNumber: 2,
              episodeNumber: 7,
            },
          ])
        );
      }
      return Promise.resolve(
        jsonResponse([
          { title: 'Some Movie', physicalRelease: '2026-09-01T00:00:00Z', hasFile: true },
        ])
      );
    });

    const result = await getUpcomingReleases(
      { url: 'https://sonarr.example.com', apiKey: 'skey' },
      { url: 'https://radarr.example.com', apiKey: 'rkey' },
      new Date('2026-09-01'),
      new Date('2026-09-07'),
      fetchMock
    );

    expect(result).toEqual([
      { title: 'Some Movie', releaseDate: '2026-09-01T00:00:00Z', available: true, kind: 'movie', seasonNumber: null, episodeNumber: null },
      {
        title: 'Some Show',
        releaseDate: '2026-09-03T00:00:00Z',
        available: false,
        kind: 'episode',
        seasonNumber: 2,
        episodeNumber: 7,
      },
    ]);
  });

  it('throws when Sonarr API returns an error status', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('sonarr')) {
        return Promise.resolve(jsonResponse([], false));
      }
      return Promise.resolve(
        jsonResponse([
          { title: 'Some Movie', physicalRelease: '2026-09-01T00:00:00Z', hasFile: true },
        ])
      );
    });

    await expect(
      getUpcomingReleases(
        { url: 'https://sonarr.example.com', apiKey: 'skey' },
        { url: 'https://radarr.example.com', apiKey: 'rkey' },
        new Date('2026-09-01'),
        new Date('2026-09-07'),
        fetchMock
      )
    ).rejects.toThrow('Sonarr API request failed: 400 ');
  });

  it('throws when Radarr API returns an error status', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('sonarr')) {
        return Promise.resolve(
          jsonResponse([
            {
              series: { title: 'Some Show' },
              airDateUtc: '2026-09-03T00:00:00Z',
              hasFile: false,
              seasonNumber: 2,
              episodeNumber: 7,
            },
          ])
        );
      }
      return Promise.resolve(jsonResponse([], false));
    });

    await expect(
      getUpcomingReleases(
        { url: 'https://sonarr.example.com', apiKey: 'skey' },
        { url: 'https://radarr.example.com', apiKey: 'rkey' },
        new Date('2026-09-01'),
        new Date('2026-09-07'),
        fetchMock
      )
    ).rejects.toThrow('Radarr API request failed: 400 ');
  });
});
