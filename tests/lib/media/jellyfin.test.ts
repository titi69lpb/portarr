import { describe, it, expect, vi } from 'vitest';
import {
  jellyfinClientAuth,
  jellyfinTokenAuth,
  listUsers,
  authenticateByName,
  logoutSession,
  getRecentItems,
  searchItems,
  fetchJellyfinPoster,
  jellyfinPosterRef,
  parseJellyfinPosterRef,
  jellyfinWebUrl,
} from '../../../src/lib/media/jellyfin';

const CFG = { url: 'http://jellyfin.local:8096', apiKey: 'key123' };
const ID = '1a2b3c4d5e6f47a8b9c0d1e2f3a4b5c6';

function res(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: async () => body,
    headers: new Headers({ 'content-type': 'application/json' }),
    arrayBuffer: async () => new ArrayBuffer(0),
  } as unknown as Response;
}

function calls(fetchFn: typeof fetch): Array<[string, RequestInit]> {
  return (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls as Array<[string, RequestInit]>;
}

describe('auth headers', () => {
  it('the client header has the Client/Device/DeviceId/Version parts and no token', () => {
    expect(jellyfinClientAuth()).toBe(
      'MediaBrowser Client="Portarr", Device="Portarr", DeviceId="portarr", Version="1"'
    );
  });

  it('the token header appends the token and strips quotes and line breaks from it', () => {
    expect(jellyfinTokenAuth('abc')).toBe(
      'MediaBrowser Client="Portarr", Device="Portarr", DeviceId="portarr", Version="1", Token="abc"'
    );
    expect(jellyfinTokenAuth('a"b\r\nc')).toContain('Token="abc"');
  });
});

describe('listUsers', () => {
  it('sends the token header and maps users (there is no email field on Jellyfin users)', async () => {
    const fetchFn = vi.fn(async () =>
      res([
        { Id: ID, Name: 'alice', Policy: { IsAdministrator: true, IsDisabled: false, IsHidden: true } },
        { Id: 'b'.repeat(32), Name: 'guest', Policy: { IsAdministrator: false, IsDisabled: true } },
      ])
    ) as unknown as typeof fetch;
    const users = await listUsers(CFG, fetchFn);
    expect(users).toEqual([
      { id: ID, name: 'alice', isAdministrator: true, isDisabled: false },
      { id: 'b'.repeat(32), name: 'guest', isAdministrator: false, isDisabled: true },
    ]);
    const [url, init] = calls(fetchFn)[0];
    expect(url).toBe('http://jellyfin.local:8096/Users');
    expect((init.headers as Record<string, string>).Authorization).toContain('Token="key123"');
  });

  it('throws with the status when Jellyfin answers non-ok', async () => {
    const fetchFn = vi.fn(async () => res({}, 401)) as unknown as typeof fetch;
    await expect(listUsers(CFG, fetchFn)).rejects.toThrow('Jellyfin API request failed: 401');
  });
});

describe('authenticateByName', () => {
  it('posts Username/Pw with the client header (no token) and returns the user and access token', async () => {
    const fetchFn = vi.fn(async () =>
      res({ User: { Id: ID, Name: 'alice', Policy: { IsAdministrator: true, IsDisabled: false } }, AccessToken: 'tok' })
    ) as unknown as typeof fetch;
    const result = await authenticateByName(CFG, 'alice', 's3cret', fetchFn);
    expect(result).toEqual({
      status: 'ok',
      user: { id: ID, name: 'alice', isAdministrator: true, isDisabled: false },
      accessToken: 'tok',
    });
    const [url, init] = calls(fetchFn)[0];
    expect(url).toBe('http://jellyfin.local:8096/Users/AuthenticateByName');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ Username: 'alice', Pw: 's3cret' });
    const auth = (init.headers as Record<string, string>).Authorization;
    expect(auth).toBe(jellyfinClientAuth());
    expect(auth).not.toContain('Token=');
  });

  it('returns denied on 401 (wrong password and unknown account are indistinguishable)', async () => {
    const fetchFn = vi.fn(async () => res('Error processing request.', 401)) as unknown as typeof fetch;
    expect(await authenticateByName(CFG, 'x', 'y', fetchFn)).toEqual({ status: 'denied' });
  });

  it('throws on other failures without leaking the password into the message', async () => {
    const fetchFn = vi.fn(async () => res({}, 500)) as unknown as typeof fetch;
    const error = await authenticateByName(CFG, 'x', 'p4ssw0rd-secret', fetchFn).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('500');
    expect((error as Error).message).not.toContain('p4ssw0rd-secret');
  });

  it('throws when a 200 response has no user or no token', async () => {
    const fetchFn = vi.fn(async () => res({ User: { Id: ID } })) as unknown as typeof fetch;
    await expect(authenticateByName(CFG, 'x', 'y', fetchFn)).rejects.toThrow(/missing/);
  });
});

describe('logoutSession', () => {
  it('posts to /Sessions/Logout with the user token in the header', async () => {
    const fetchFn = vi.fn(async () => res(null, 204)) as unknown as typeof fetch;
    await logoutSession(CFG, 'usertoken', fetchFn);
    const [url, init] = calls(fetchFn)[0];
    expect(url).toBe('http://jellyfin.local:8096/Sessions/Logout');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toContain('Token="usertoken"');
  });

  it('throws when the logout is refused', async () => {
    const fetchFn = vi.fn(async () => res({}, 401)) as unknown as typeof fetch;
    await expect(logoutSession(CFG, 't', fetchFn)).rejects.toThrow('401');
  });
});

describe('getRecentItems', () => {
  const RAW_EPISODE_ORPHAN = {
    Id: 'e88b8620b06e4462ece7eb2dd20157c1',
    Name: 'Has Fallen - S02E03',
    Type: 'Episode',
    ServerId: 'srv',
    DateCreated: '2026-09-21T14:06:43.300184Z',
    ImageTags: {},
    ParentPrimaryImageItemId: 'f2b38fba124afa939639eed2cb1f8e4d',
  };
  const RAW_EPISODE = {
    Id: '92d37a61bbdef9dfb98f3fca21b7dec0',
    Name: "A New New York Yankee in King Elfo's Court",
    Type: 'Episode',
    ServerId: 'srv',
    DateCreated: '2026-09-21T09:13:21.3359525Z',
    ProductionYear: 2026,
    SeriesName: 'Futurama',
    SeriesId: 'eb8e30f47579210b3576e393001074c5',
    SeasonId: 'a846ff2cf5a4d89d6d0e6593d2475cab',
    ImageTags: { Primary: 'tag' },
    SeriesPrimaryImageTag: 'stag',
    ParentPrimaryImageItemId: 'a846ff2cf5a4d89d6d0e6593d2475cab',
  };

  it('requests the newest items of one type with the API key and maps the fields', async () => {
    const fetchFn = vi.fn(async () => res({ Items: [RAW_EPISODE_ORPHAN, RAW_EPISODE], TotalRecordCount: 2 })) as unknown as typeof fetch;
    const items = await getRecentItems(CFG, 'Episode', 50, fetchFn);
    const url = calls(fetchFn)[0][0];
    expect(url).toContain('http://jellyfin.local:8096/Items?');
    expect(url).toContain('includeItemTypes=Episode');
    expect(url).toContain('recursive=true');
    expect(url).toContain('sortBy=DateCreated');
    expect(url).toContain('sortOrder=Descending');
    expect(url).toContain('limit=50');
    expect(url).toContain('fields=DateCreated');
    expect(items[0]).toMatchObject({
      id: 'e88b8620b06e4462ece7eb2dd20157c1',
      seriesName: null,
      seriesId: null,
      hasPrimaryImage: false,
      parentPrimaryImageItemId: 'f2b38fba124afa939639eed2cb1f8e4d',
    });
    expect(items[1]).toMatchObject({
      name: "A New New York Yankee in King Elfo's Court",
      type: 'Episode',
      serverId: 'srv',
      dateCreated: '2026-09-21T09:13:21.3359525Z',
      productionYear: 2026,
      seriesName: 'Futurama',
      seriesId: 'eb8e30f47579210b3576e393001074c5',
      seasonId: 'a846ff2cf5a4d89d6d0e6593d2475cab',
      hasPrimaryImage: true,
      hasSeriesPrimaryImage: true,
    });
  });
});

describe('searchItems', () => {
  it('searches movies and series with the term encoded', async () => {
    const fetchFn = vi.fn(async () =>
      res({ Items: [{ Id: 'eb8e30f47579210b3576e393001074c5', Name: 'Futurama', Type: 'Series', ProductionYear: 1999, ImageTags: { Primary: 't' } }] })
    ) as unknown as typeof fetch;
    const items = await searchItems(CFG, 'fu tu', 10, fetchFn);
    const url = calls(fetchFn)[0][0];
    expect(url).toContain('searchTerm=fu%20tu');
    expect(url).toContain('includeItemTypes=Movie,Series');
    expect(url).toContain('recursive=true');
    expect(url).toContain('limit=10');
    expect(items[0]).toMatchObject({ name: 'Futurama', type: 'Series', productionYear: 1999, hasPrimaryImage: true });
  });
});

describe('poster helpers', () => {
  it('round-trips a valid ref and rejects malformed ones', () => {
    expect(jellyfinPosterRef(ID)).toBe(`jellyfin:${ID}`);
    expect(parseJellyfinPosterRef(`jellyfin:${ID}`)).toBe(ID);
    expect(parseJellyfinPosterRef('jellyfin:1a2b3c4d-5e6f-47a8-b9c0-d1e2f3a4b5c6')).toBe(
      '1a2b3c4d-5e6f-47a8-b9c0-d1e2f3a4b5c6'
    );
    expect(parseJellyfinPosterRef('jellyfin:../../etc/passwd')).toBeNull();
    expect(parseJellyfinPosterRef('jellyfin:abc')).toBeNull();
    expect(parseJellyfinPosterRef('/library/metadata/1/thumb/1')).toBeNull();
    expect(parseJellyfinPosterRef('')).toBeNull();
  });

  it('fetchJellyfinPoster requests the resized primary image with the token header', async () => {
    const fetchFn = vi.fn(
      async () => new Response(new Uint8Array([9, 8]), { status: 200, headers: { 'Content-Type': 'image/jpeg' } })
    ) as unknown as typeof fetch;
    const result = await fetchJellyfinPoster(CFG, ID, fetchFn);
    expect(result?.contentType).toBe('image/jpeg');
    expect(Array.from(new Uint8Array(result!.bytes))).toEqual([9, 8]);
    const [url, init] = calls(fetchFn)[0];
    expect(url).toBe(`http://jellyfin.local:8096/Items/${ID}/Images/Primary?maxWidth=300&maxHeight=450&quality=90`);
    expect((init.headers as Record<string, string>).Authorization).toContain('Token="key123"');
  });

  it('fetchJellyfinPoster returns null for an invalid id (no fetch) and for an upstream failure', async () => {
    const fetchFn = vi.fn(async () => new Response('bad', { status: 400 })) as unknown as typeof fetch;
    expect(await fetchJellyfinPoster(CFG, '../x', fetchFn)).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
    expect(await fetchJellyfinPoster(CFG, ID, fetchFn)).toBeNull();
  });
});

describe('jellyfinWebUrl', () => {
  it('builds the web client details link, with the server id when known', () => {
    expect(jellyfinWebUrl('http://j.local:8096', ID, 'srv1')).toBe(
      `http://j.local:8096/web/index.html#/details?id=${ID}&serverId=srv1`
    );
    expect(jellyfinWebUrl('http://j.local:8096', ID, null)).toBe(`http://j.local:8096/web/index.html#/details?id=${ID}`);
  });
});
