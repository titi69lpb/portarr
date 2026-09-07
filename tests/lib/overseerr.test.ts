import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getPendingRequests, getAvailableRequests, resetOverseerrCacheForTests } from '../../src/lib/overseerr';

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body } as Response;
}

beforeEach(() => {
  resetOverseerrCacheForTests();
});

describe('getPendingRequests', () => {
  it('requests enough items to cover a real backlog, not just the first handful — this portal has had 47 pending requests at once', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ results: [] }));
    await getPendingRequests('https://overseerr.example.com', 'key', fetchMock);
    const url = fetchMock.mock.calls[0][0] as string;
    const take = Number(new URL(url).searchParams.get('take'));
    expect(take).toBeGreaterThanOrEqual(47);
  });

  it('returns an empty array when there are no approved requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ results: [] }));
    const result = await getPendingRequests('https://overseerr.example.com', 'key', fetchMock);
    expect(result).toEqual([]);
  });

  it('includes an approved request whose media is not yet fully available, resolves its title', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/request')) {
        return Promise.resolve(
          jsonResponse({
            results: [
              {
                id: 1,
                status: 2,
                type: 'movie',
                createdAt: '2026-08-28T19:25:02.000Z',
                media: { tmdbId: 550, status: 3 },
                requestedBy: { username: 'alice', displayName: 'Alice' },
              },
            ],
          })
        );
      }
      return Promise.resolve(jsonResponse({ title: 'Fight Club', posterPath: '/abc123.jpg' }));
    });

    const result = await getPendingRequests('https://overseerr.example.com', 'key', fetchMock);
    expect(result).toEqual([
      {
        title: 'Fight Club',
        type: 'movie',
        posterPath: '/abc123.jpg',
        requestedByUsername: 'Alice',
        requestedAt: '2026-08-28T19:25:02.000Z',
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/movie/550'),
      expect.anything()
    );
  });

  it('falls back to null posterPath when the detail response has none', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/request')) {
        return Promise.resolve(
          jsonResponse({
            results: [
              {
                id: 4,
                status: 2,
                type: 'movie',
                createdAt: '2026-08-28T19:25:02.000Z',
                media: { tmdbId: 552, status: 3 },
                requestedBy: { username: 'dave', displayName: 'Dave' },
              },
            ],
          })
        );
      }
      return Promise.resolve(jsonResponse({ title: 'No Poster Movie' }));
    });

    const result = await getPendingRequests('https://overseerr.example.com', 'key', fetchMock);
    expect(result[0].posterPath).toBeNull();
  });

  it('excludes an approved request whose media is already fully available (status 5)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        results: [
          {
            id: 2,
            status: 2,
            type: 'movie',
            createdAt: '2026-08-28T19:25:02.000Z',
            media: { tmdbId: 551, status: 5 },
            requestedBy: { username: 'bob', displayName: 'Bob' },
          },
        ],
      })
    );
    const result = await getPendingRequests('https://overseerr.example.com', 'key', fetchMock);
    expect(result).toEqual([]);
  });

  it('falls back to a placeholder title when the detail lookup fails, without dropping the item', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/request')) {
        return Promise.resolve(
          jsonResponse({
            results: [
              {
                id: 3,
                status: 2,
                type: 'tv',
                createdAt: '2026-08-28T19:25:02.000Z',
                media: { tmdbId: 999, status: 1 },
                requestedBy: { username: 'carol', displayName: 'Carol' },
              },
            ],
          })
        );
      }
      return Promise.resolve(jsonResponse({}, false));
    });

    const result = await getPendingRequests('https://overseerr.example.com', 'key', fetchMock);
    expect(result).toEqual([
      {
        title: 'Média inconnu',
        type: 'tv',
        posterPath: null,
        requestedByUsername: 'Carol',
        requestedAt: '2026-08-28T19:25:02.000Z',
      },
    ]);
  });

  it('throws when the Overseerr request-list API returns an error status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, false));
    await expect(
      getPendingRequests('https://overseerr.example.com', 'key', fetchMock)
    ).rejects.toThrow('Overseerr API request failed: 500');
  });

  it('caches a resolved title/poster by tmdbId — a second request for the same media does not refetch its detail', async () => {
    const requestList = (ids: number[]) =>
      jsonResponse({
        results: ids.map((tmdbId, i) => ({
          id: i,
          status: 2,
          type: 'movie' as const,
          createdAt: '2026-08-28T19:25:02.000Z',
          media: { tmdbId, status: 3 },
          requestedBy: { username: `user${i}`, displayName: `User${i}` },
        })),
      });

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/request')) return Promise.resolve(requestList([777]));
      return Promise.resolve(jsonResponse({ title: 'Cached Movie', posterPath: '/cached.jpg' }));
    });

    await getPendingRequests('https://overseerr.example.com', 'key', fetchMock);
    const detailCallsAfterFirst = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('/api/v1/movie/777')
    ).length;
    expect(detailCallsAfterFirst).toBe(1);

    const result = await getPendingRequests('https://overseerr.example.com', 'key', fetchMock);
    const detailCallsAfterSecond = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('/api/v1/movie/777')
    ).length;

    expect(detailCallsAfterSecond).toBe(1);
    expect(result[0].title).toBe('Cached Movie');
  });
});

describe('getAvailableRequests', () => {
  it('returns an available request with its requester email resolved (real production shape: request.status is 5 too, not 2)', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/request')) {
        return Promise.resolve(
          jsonResponse({
            results: [
              {
                id: 1045,
                status: 5,
                type: 'movie',
                createdAt: '2025-09-09T07:31:37.000Z',
                media: { tmdbId: 87513, status: 5 },
                requestedBy: { username: 'Andaril', displayName: 'Andaril', email: 'admin@b.com' },
              },
            ],
          })
        );
      }
      return Promise.resolve(jsonResponse({ title: 'Some Movie' }));
    });
    const result = await getAvailableRequests('https://overseerr.example.com', 'key', fetchMock);
    expect(result).toEqual([
      {
        requestId: 1045,
        title: 'Some Movie',
        type: 'movie',
        requesterEmail: 'admin@b.com',
        requesterUsername: 'Andaril',
      },
    ]);
  });

  it('regression: does not require request.status === 2 — confirmed live that Overseerr sets it to 5 once available', async () => {
    // The original implementation filtered on `r.status === 2 && r.media.status === 5`,
    // which silently excluded every available request in production (verified via a
    // live curl against Overseerr before this fix) because request.status mirrors
    // media.status once available, it never stays at 2.
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/request')) {
        return Promise.resolve(
          jsonResponse({
            results: [
              {
                id: 9001,
                status: 5,
                type: 'movie',
                createdAt: '2025-09-09T07:31:37.000Z',
                media: { tmdbId: 42, status: 5 },
                requestedBy: { username: 'x', displayName: 'X', email: 'x@b.com' },
              },
            ],
          })
        );
      }
      return Promise.resolve(jsonResponse({ title: 'Regression Movie' }));
    });
    const result = await getAvailableRequests('https://overseerr.example.com', 'key', fetchMock);
    expect(result).toHaveLength(1);
    expect(result[0].requestId).toBe(9001);
  });

  it('excludes a request whose media is approved but not yet available', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        results: [
          {
            id: 1,
            status: 2,
            type: 'movie',
            createdAt: '2025-09-09T07:31:37.000Z',
            media: { tmdbId: 1, status: 3 },
            requestedBy: { username: 'a', displayName: 'A', email: 'a@b.com' },
          },
        ],
      })
    );
    const result = await getAvailableRequests('https://overseerr.example.com', 'key', fetchMock);
    expect(result).toEqual([]);
  });

  it('returns null requesterEmail when Overseerr has none on file, instead of dropping the item', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/request')) {
        return Promise.resolve(
          jsonResponse({
            results: [
              {
                id: 2,
                status: 2,
                type: 'tv',
                createdAt: '2025-09-09T07:31:37.000Z',
                media: { tmdbId: 2, status: 5 },
                requestedBy: { username: 'b', displayName: 'B' },
              },
            ],
          })
        );
      }
      return Promise.resolve(jsonResponse({ name: 'Some Show' }));
    });
    const result = await getAvailableRequests('https://overseerr.example.com', 'key', fetchMock);
    expect(result).toEqual([
      { requestId: 2, title: 'Some Show', type: 'tv', requesterEmail: null, requesterUsername: 'B' },
    ]);
  });

  it('skips (rather than placeholder-fills) an item whose title detail lookup fails', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/request')) {
        return Promise.resolve(
          jsonResponse({
            results: [
              {
                id: 3,
                status: 2,
                type: 'movie',
                createdAt: '2025-09-09T07:31:37.000Z',
                media: { tmdbId: 3, status: 5 },
                requestedBy: { username: 'c', displayName: 'C', email: 'c@b.com' },
              },
            ],
          })
        );
      }
      return Promise.resolve(jsonResponse({}, false));
    });
    const result = await getAvailableRequests('https://overseerr.example.com', 'key', fetchMock);
    expect(result).toEqual([]);
  });

  it('throws when the Overseerr request-list API returns an error status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, false));
    await expect(
      getAvailableRequests('https://overseerr.example.com', 'key', fetchMock)
    ).rejects.toThrow('Overseerr API request failed: 500');
  });
});
