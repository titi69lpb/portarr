import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createPin,
  pollPin,
  getPlexIdentity,
  getSharedUsers,
  getRecentlyAdded,
  getRecentlyAddedSplit,
  isStillSharedUser,
  searchLibrary,
} from '../../src/lib/plex';
import { resetTtlCacheForTests } from '../../src/lib/ttl-cache';

// getRecentlyAdded is now cached (DEFAULT_CACHE_TTL_MS) — without this, a test
// running after another with the same (plexUrl, count) would see the earlier
// test's mocked response instead of its own.
beforeEach(() => {
  resetTtlCacheForTests();
});

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 400,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

function xmlResponse(xml: string) {
  return { ok: true, status: 200, text: async () => xml } as Response;
}

function errorResponse(status: number, statusText: string = 'Error') {
  return {
    ok: false,
    status,
    statusText,
    json: async () => ({}),
    text: async () => '{}',
  } as Response;
}

describe('createPin', () => {
  it('posts to plex.tv and returns pin details', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ id: 999, code: 'ABCD' })
    );
    const result = await createPin('test-client-id', fetchMock);
    expect(result).toEqual({
      pinId: 999,
      code: 'ABCD',
      authUrl: expect.stringContaining('code=ABCD'),
    });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://plex.tv/api/v2/pins');
    expect(options.method).toBe('POST');
  });

  it('throws when the API returns an error status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errorResponse(401, 'Unauthorized'));
    await expect(createPin('test-client-id', fetchMock)).rejects.toThrow(
      'Plex API request failed: 401 Unauthorized'
    );
  });
});

describe('pollPin', () => {
  it('returns null while the pin has no authToken yet', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 999, authToken: null }));
    const result = await pollPin(999, 'test-client-id', fetchMock);
    expect(result).toBeNull();
  });

  it('returns the auth token once claimed', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: 999, authToken: 'user-token-abc' }));
    const result = await pollPin(999, 'test-client-id', fetchMock);
    expect(result).toBe('user-token-abc');
  });

  it('throws when the API returns an error status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errorResponse(500, 'Internal Server Error'));
    await expect(pollPin(999, 'test-client-id', fetchMock)).rejects.toThrow(
      'Plex API request failed: 500 Internal Server Error'
    );
  });
});

describe('getPlexIdentity', () => {
  it('parses id/email/username from the plex.tv user endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ id: 42, email: 'user@example.com', username: 'someuser' })
    );
    const result = await getPlexIdentity('user-token-abc', 'test-client-id', fetchMock);
    expect(result).toEqual({ plexId: '42', email: 'user@example.com', username: 'someuser' });
  });

  it('throws when the API returns an error status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errorResponse(401, 'Unauthorized'));
    await expect(getPlexIdentity('expired-token', 'test-client-id', fetchMock)).rejects.toThrow(
      'Plex API request failed: 401 Unauthorized'
    );
  });
});

describe('getSharedUsers', () => {
  it('parses the XML user list and keeps only users shared on the given server', async () => {
    const xml = `<?xml version="1.0"?>
<MediaContainer>
  <User id="1" username="alice" email="alice@example.com">
    <Server id="s1" name="My Plex Server" />
  </User>
  <User id="2" username="bob" email="bob@example.com">
    <Server id="s2" name="Some Other Server" />
  </User>
</MediaContainer>`;
    const fetchMock = vi.fn().mockResolvedValue(xmlResponse(xml));
    const result = await getSharedUsers('admin-token', 'My Plex Server', fetchMock);
    expect(result).toEqual([{ plexId: '1', email: 'alice@example.com', username: 'alice' }]);
  });

  it('returns an empty array when no user matches the server name', async () => {
    const xml = `<?xml version="1.0"?><MediaContainer></MediaContainer>`;
    const fetchMock = vi.fn().mockResolvedValue(xmlResponse(xml));
    const result = await getSharedUsers('admin-token', 'My Plex Server', fetchMock);
    expect(result).toEqual([]);
  });

  it('throws when the API returns an error status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errorResponse(401, 'Unauthorized'));
    await expect(getSharedUsers('invalid-token', 'My Plex Server', fetchMock)).rejects.toThrow(
      'Plex API request failed: 401 Unauthorized'
    );
  });
});

describe('getRecentlyAdded', () => {
  const MACHINE_ID = 'recent-machine-id';

  // getRecentlyAdded fans out to two Hub calls (type=1 movies, type=2 TV) plus
  // a machineIdentifier lookup (used to build plexWebUrl) via Promise.all.
  // Route each mock response by URL rather than call order.
  function hubFetchMock(movies: Record<string, unknown>[], tv: Record<string, unknown>[], identityOk = true) {
    return vi.fn().mockImplementation((url: string) => {
      if (url.includes('/identity')) {
        return Promise.resolve(
          identityOk
            ? jsonResponse({ MediaContainer: { machineIdentifier: MACHINE_ID } })
            : errorResponse(500, 'Server Error')
        );
      }
      const isMovies = url.includes('type=1');
      return Promise.resolve(
        jsonResponse({ MediaContainer: { Metadata: isMovies ? movies : tv } })
      );
    });
  }

  it('parses recently added items from both hubs, newest first, each with a Plex Web deep link', async () => {
    const movies = [
      {
        title: 'Some Movie',
        thumb: '/library/metadata/1/thumb/123',
        addedAt: 1787900000,
        type: 'movie',
        ratingKey: '1',
      },
    ];
    const tv = [
      {
        title: 'Some Episode',
        grandparentTitle: 'Some Show',
        parentThumb: '/library/metadata/2/thumb/456',
        thumb: '/library/metadata/2/thumb/999',
        addedAt: 1787900100,
        type: 'episode',
        // Episode rows link to the SEASON (parentRatingKey), matching the
        // season poster/title actually shown — not the episode's own ratingKey.
        parentRatingKey: '2',
        ratingKey: '999',
      },
    ];
    const fetchMock = hubFetchMock(movies, tv);
    const result = await getRecentlyAdded('https://plex.example.com', 'server-token', 10, fetchMock);
    // "Some Episode" is newer (higher addedAt) than "Some Movie" — output must be
    // sorted descending by addedAt, not left in Plex's raw document order.
    expect(result).toEqual([
      {
        title: 'Some Show',
        thumbPath: '/library/metadata/2/thumb/456',
        addedAt: new Date(1787900100 * 1000).toISOString(),
        type: 'episode',
        plexWebUrl: `https://plex.example.com/web/index.html#!/server/${MACHINE_ID}/details?key=%2Flibrary%2Fmetadata%2F2`,
      },
      {
        title: 'Some Movie',
        thumbPath: '/library/metadata/1/thumb/123',
        addedAt: new Date(1787900000 * 1000).toISOString(),
        type: 'movie',
        plexWebUrl: `https://plex.example.com/web/index.html#!/server/${MACHINE_ID}/details?key=%2Flibrary%2Fmetadata%2F1`,
      },
    ]);
  });

  it('sets plexWebUrl to null (not throwing) when the machineIdentifier lookup fails', async () => {
    const movies = [
      { title: 'Some Movie', thumb: '/thumb/1', addedAt: 1000, type: 'movie', ratingKey: '1' },
    ];
    const fetchMock = hubFetchMock(movies, [], false);
    const result = await getRecentlyAdded('https://plex.example.com', 'server-token', 10, fetchMock);
    expect(result[0].plexWebUrl).toBeNull();
  });

  it('sets plexWebUrl to null when an item has no ratingKey', async () => {
    const movies = [{ title: 'No Rating Key', thumb: '/thumb/1', addedAt: 1000, type: 'movie' }];
    const fetchMock = hubFetchMock(movies, []);
    const result = await getRecentlyAdded('https://plex.example.com', 'server-token', 10, fetchMock);
    expect(result[0].plexWebUrl).toBeNull();
  });

  it('surfaces a new episode added to an already-known season', async () => {
    // This is the real-world regression this endpoint switch fixes: the old
    // /library/recentlyAdded endpoint stamps TV <Directory type="season">
    // nodes with the season's creation date, so a new episode added to a
    // season already in the library never bumped anything and never
    // resurfaced. /hubs/home/recentlyAdded?type=2 returns the episode itself
    // with its own addedAt, independent of when the season was created.
    const tv = [
      {
        title: 'New Episode',
        grandparentTitle: 'House of Cards (US)',
        parentThumb: '/library/metadata/2/thumb/456',
        addedAt: 1787900200,
        type: 'episode',
      },
    ];
    const fetchMock = hubFetchMock([], tv);
    const result = await getRecentlyAdded('https://plex.example.com', 'server-token', 10, fetchMock);
    expect(result).toEqual([
      {
        title: 'House of Cards (US)',
        thumbPath: '/library/metadata/2/thumb/456',
        addedAt: new Date(1787900200 * 1000).toISOString(),
        type: 'episode',
        plexWebUrl: null,
      },
    ]);
  });

  it('handles season- and show-level grouping rows, not just single episodes', async () => {
    // When several new episodes land at once, Plex's TV hub collapses them
    // into one "season" or "show" row instead of one row per episode — these
    // name and poster themselves off different fields than an episode row.
    const tv = [
      {
        title: 'Season 1',
        parentTitle: 'Severance',
        thumb: '/library/metadata/10/thumb/1',
        parentThumb: '/library/metadata/11/thumb/1',
        addedAt: 2000,
        type: 'season',
      },
      {
        title: 'Westworld',
        thumb: '/library/metadata/20/thumb/1',
        addedAt: 1000,
        type: 'show',
      },
    ];
    const fetchMock = hubFetchMock([], tv);
    const result = await getRecentlyAdded('https://plex.example.com', 'server-token', 10, fetchMock);
    expect(result).toEqual([
      {
        title: 'Severance',
        thumbPath: '/library/metadata/10/thumb/1',
        addedAt: new Date(2000 * 1000).toISOString(),
        type: 'episode',
        plexWebUrl: null,
      },
      {
        title: 'Westworld',
        thumbPath: '/library/metadata/20/thumb/1',
        addedAt: new Date(1000 * 1000).toISOString(),
        type: 'episode',
        plexWebUrl: null,
      },
    ]);
  });

  it('slices the merged, sorted list down to the requested count', async () => {
    const movies = [
      { title: 'Oldest', thumb: '/library/metadata/1/thumb/1', addedAt: 1000, type: 'movie' },
      { title: 'Middle', thumb: '/library/metadata/3/thumb/3', addedAt: 2000, type: 'movie' },
    ];
    const tv = [
      {
        title: 'Ep',
        grandparentTitle: 'Newest Show',
        parentThumb: '/library/metadata/2/thumb/2',
        addedAt: 3000,
        type: 'episode',
      },
    ];
    const fetchMock = hubFetchMock(movies, tv);
    const result = await getRecentlyAdded('https://plex.example.com', 'server-token', 2, fetchMock);
    expect(result.map((r) => r.title)).toEqual(['Newest Show', 'Middle']);
  });

  it('throws when the API returns an error status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errorResponse(503, 'Service Unavailable'));
    await expect(getRecentlyAdded('https://plex.example.com', 'server-token', 10, fetchMock)).rejects.toThrow(
      'Plex API request failed: 503 Service Unavailable'
    );
  });
});

describe('getRecentlyAddedSplit', () => {
  const MACHINE_ID = 'split-machine-id';

  function hubFetchMock(movies: Record<string, unknown>[], tv: Record<string, unknown>[]) {
    return vi.fn().mockImplementation((url: string) => {
      if (url.includes('/identity')) {
        return Promise.resolve(jsonResponse({ MediaContainer: { machineIdentifier: MACHINE_ID } }));
      }
      const isMovies = url.includes('type=1');
      return Promise.resolve(jsonResponse({ MediaContainer: { Metadata: isMovies ? movies : tv } }));
    });
  }

  it('keeps movies and episodes as two separate, independently-capped, newest-first lists', async () => {
    const movies = [
      { title: 'Older Movie', thumb: '/thumb/1', addedAt: 1000, type: 'movie' },
      { title: 'Newer Movie', thumb: '/thumb/2', addedAt: 2000, type: 'movie' },
    ];
    const tv = [
      { title: 'Pilot', grandparentTitle: 'Some Show', parentThumb: '/thumb/3', addedAt: 1500, type: 'episode' },
    ];
    const fetchMock = hubFetchMock(movies, tv);
    const result = await getRecentlyAddedSplit('https://plex.example.com', 'server-token', 10, fetchMock);

    expect(result.movies.map((r) => r.title)).toEqual(['Newer Movie', 'Older Movie']);
    expect(result.episodes.map((r) => r.title)).toEqual(['Some Show']);
  });

  it('resolves plexWebUrl for each item, using parentRatingKey for episode-grouped rows', async () => {
    const movies = [{ title: 'A Movie', thumb: '/thumb/1', addedAt: 1000, type: 'movie', ratingKey: '10' }];
    const tv = [
      {
        title: 'Pilot',
        grandparentTitle: 'Some Show',
        parentThumb: '/thumb/3',
        addedAt: 1500,
        type: 'episode',
        parentRatingKey: '20',
      },
    ];
    const fetchMock = hubFetchMock(movies, tv);
    const result = await getRecentlyAddedSplit('https://plex.example.com', 'server-token', 10, fetchMock);

    expect(result.movies[0].plexWebUrl).toBe(
      `https://plex.example.com/web/index.html#!/server/${MACHINE_ID}/details?key=%2Flibrary%2Fmetadata%2F10`
    );
    expect(result.episodes[0].plexWebUrl).toBe(
      `https://plex.example.com/web/index.html#!/server/${MACHINE_ID}/details?key=%2Flibrary%2Fmetadata%2F20`
    );
  });

  it('caps each type independently at countPerType, not a shared total', async () => {
    const movies = Array.from({ length: 5 }, (_, i) => ({
      title: `Movie ${i}`,
      thumb: '/thumb',
      addedAt: 1000 + i,
      type: 'movie',
    }));
    const fetchMock = hubFetchMock(movies, []);
    const result = await getRecentlyAddedSplit('https://plex.example.com', 'server-token', 2, fetchMock);
    expect(result.movies).toHaveLength(2);
    expect(result.episodes).toHaveLength(0);
  });

  it('is a separate cache entry from getRecentlyAdded — one does not serve stale data to the other', async () => {
    const movies = [{ title: 'A Movie', thumb: '/thumb/1', addedAt: 1000, type: 'movie' }];
    const fetchMock = hubFetchMock(movies, []);
    await getRecentlyAdded('https://plex.example.com', 'server-token', 15, fetchMock);
    const splitResult = await getRecentlyAddedSplit('https://plex.example.com', 'server-token', 15, fetchMock);
    expect(splitResult.movies.map((r) => r.title)).toEqual(['A Movie']);
  });

  it('throws when the API returns an error status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errorResponse(503, 'Service Unavailable'));
    await expect(
      getRecentlyAddedSplit('https://plex.example.com', 'server-token', 10, fetchMock)
    ).rejects.toThrow('Plex API request failed: 503 Service Unavailable');
  });
});

describe('isStillSharedUser', () => {
  const sharedXml = `<?xml version="1.0"?>
<MediaContainer>
  <User id="1" username="alice" email="alice@example.com">
    <Server id="s1" name="My Plex Server" />
  </User>
</MediaContainer>`;

  it('returns true when the plexId is still in the shared-users list', async () => {
    const fetchMock = vi.fn().mockResolvedValue(xmlResponse(sharedXml));
    const result = await isStillSharedUser('1', 'admin-token', 'My Plex Server', fetchMock);
    expect(result).toBe(true);
  });

  it('returns false when the plexId is no longer in the shared-users list (share revoked)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(xmlResponse(sharedXml));
    const result = await isStillSharedUser('999', 'admin-token', 'My Plex Server', fetchMock);
    expect(result).toBe(false);
  });

  it('fails open (returns true) when the Plex API call errors, instead of locking every session out', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errorResponse(503, 'Service Unavailable'));
    const result = await isStillSharedUser('1', 'admin-token', 'My Plex Server', fetchMock);
    expect(result).toBe(true);
  });

  it('caches the shared-users list — a second call within the TTL does not hit Plex again', async () => {
    const fetchMock = vi.fn().mockResolvedValue(xmlResponse(sharedXml));
    await isStillSharedUser('1', 'admin-token', 'My Plex Server', fetchMock);
    await isStillSharedUser('1', 'admin-token', 'My Plex Server', fetchMock);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('searchLibrary', () => {
  const MACHINE_ID = 'abc123machine';

  function mockFetchWith(hubs: unknown, identityOk = true) {
    return vi.fn().mockImplementation((url: string) => {
      if (url.includes('/identity')) {
        return Promise.resolve(
          identityOk
            ? jsonResponse({ MediaContainer: { machineIdentifier: MACHINE_ID } })
            : errorResponse(500, 'Server Error')
        );
      }
      return Promise.resolve(jsonResponse(hubs));
    });
  }

  it('flattens movie and show hubs into a single result list, each linking to its Plex Web details page', async () => {
    const hubs = {
      MediaContainer: {
        Hub: [
          { type: 'movie', Metadata: [{ title: 'Fight Club', year: 1999, thumb: '/thumb/1', ratingKey: '111' }] },
          { type: 'show', Metadata: [{ title: 'The Wire', year: 2002, thumb: '/thumb/2', ratingKey: '222' }] },
          { type: 'actor', Metadata: [{ title: 'Someone Famous' }] },
        ],
      },
    };
    const fetchMock = mockFetchWith(hubs);
    const results = await searchLibrary('https://plex.example.com', 'server-token', 'fight', fetchMock);

    expect(results).toEqual([
      {
        title: 'Fight Club',
        year: 1999,
        type: 'movie',
        thumbPath: '/thumb/1',
        plexWebUrl: `https://plex.example.com/web/index.html#!/server/${MACHINE_ID}/details?key=%2Flibrary%2Fmetadata%2F111`,
      },
      {
        title: 'The Wire',
        year: 2002,
        type: 'show',
        thumbPath: '/thumb/2',
        plexWebUrl: `https://plex.example.com/web/index.html#!/server/${MACHINE_ID}/details?key=%2Flibrary%2Fmetadata%2F222`,
      },
    ]);
  });

  it('sets plexWebUrl to null (not throwing) when the machineIdentifier lookup fails', async () => {
    const hubs = {
      MediaContainer: {
        Hub: [{ type: 'movie', Metadata: [{ title: 'Fight Club', ratingKey: '111', thumb: '/thumb/1' }] }],
      },
    };
    const fetchMock = mockFetchWith(hubs, false);
    const results = await searchLibrary('https://plex.example.com', 'server-token', 'fight', fetchMock);
    expect(results[0].plexWebUrl).toBeNull();
  });

  it('sets plexWebUrl to null when a result has no ratingKey', async () => {
    const hubs = {
      MediaContainer: {
        Hub: [{ type: 'movie', Metadata: [{ title: 'No Rating Key', thumb: '/thumb/1' }] }],
      },
    };
    const fetchMock = mockFetchWith(hubs);
    const results = await searchLibrary('https://plex.example.com', 'server-token', 'x', fetchMock);
    expect(results[0].plexWebUrl).toBeNull();
  });

  it('skips hub types other than movie/show (actor, episode, collection, playlist...)', async () => {
    const hubs = {
      MediaContainer: {
        Hub: [{ type: 'episode', Metadata: [{ title: 'Pilot' }] }],
      },
    };
    const fetchMock = mockFetchWith(hubs);
    const results = await searchLibrary('https://plex.example.com', 'server-token', 'pilot', fetchMock);
    expect(results).toEqual([]);
  });

  it('returns an empty array without calling fetch for a blank/whitespace query', async () => {
    const fetchMock = vi.fn();
    const results = await searchLibrary('https://plex.example.com', 'server-token', '   ', fetchMock);
    expect(results).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('handles a single (non-array) Hub or Metadata entry, same XML-to-JSON single-item collapsing as elsewhere in this file', async () => {
    const hubs = {
      MediaContainer: {
        Hub: { type: 'movie', Metadata: { title: 'Solo Result', year: 2020, thumb: '/thumb/3', ratingKey: '333' } },
      },
    };
    const fetchMock = mockFetchWith(hubs);
    const results = await searchLibrary('https://plex.example.com', 'server-token', 'solo', fetchMock);
    expect(results).toEqual([
      {
        title: 'Solo Result',
        year: 2020,
        type: 'movie',
        thumbPath: '/thumb/3',
        plexWebUrl: `https://plex.example.com/web/index.html#!/server/${MACHINE_ID}/details?key=%2Flibrary%2Fmetadata%2F333`,
      },
    ]);
  });

  it('throws when the search API returns an error status', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/identity')) return Promise.resolve(jsonResponse({ MediaContainer: { machineIdentifier: MACHINE_ID } }));
      return Promise.resolve(errorResponse(503, 'Service Unavailable'));
    });
    await expect(searchLibrary('https://plex.example.com', 'server-token', 'x', fetchMock)).rejects.toThrow(
      'Plex API request failed: 503 Service Unavailable'
    );
  });

  it('caches the machineIdentifier — a second search does not re-fetch /identity', async () => {
    const hubs = { MediaContainer: { Hub: [] } };
    const fetchMock = mockFetchWith(hubs);
    await searchLibrary('https://plex.example.com', 'server-token', 'a', fetchMock);
    await searchLibrary('https://plex.example.com', 'server-token', 'b', fetchMock);
    const identityCalls = fetchMock.mock.calls.filter(([url]: [string]) => url.includes('/identity'));
    expect(identityCalls).toHaveLength(1);
  });
});
