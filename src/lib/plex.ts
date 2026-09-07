import { XMLParser } from 'fast-xml-parser';
import { timeoutSignal } from './fetch-timeout';
import { withTtlCache, DEFAULT_CACHE_TTL_MS } from './ttl-cache';

// How long a portal session can go without being re-checked against Plex's
// current share list. Session cookies last 30 days and were never re-verified
// after login — a share revoked at plex.tv kept full portal access for up to
// 30 days. This bounds that gap to ~this TTL instead, while the shared-users
// list itself is cached (see isStillSharedUser) so the actual cost is one
// Plex API call per TTL window, not one per request.
export const SESSION_REVALIDATION_TTL_MS = 5 * 60 * 1000;

export interface PlexSharedUser {
  plexId: string;
  email: string;
  username: string;
}

export interface RecentlyAddedItem {
  title: string;
  thumbPath: string;
  addedAt: string;
  type: 'movie' | 'episode';
  /** Deep link into this server's own Plex Web instance, or null if the
   * machineIdentifier lookup failed or the item had no ratingKey — callers
   * must treat that as "not clickable" rather than link to a broken URL.
   * Same contract as SearchResultItem.plexWebUrl below. */
  plexWebUrl: string | null;
}

const PLEX_HEADERS = (clientId: string) => ({
  Accept: 'application/json',
  'X-Plex-Client-Identifier': clientId,
  'X-Plex-Product': 'Portarr',
});

export async function createPin(
  clientId: string,
  fetchFn: typeof fetch = fetch
): Promise<{ pinId: number; code: string; authUrl: string }> {
  const res = await fetchFn('https://plex.tv/api/v2/pins', {
    method: 'POST',
    headers: { ...PLEX_HEADERS(clientId), 'Content-Type': 'application/json' },
    body: JSON.stringify({ strong: true }),
    signal: timeoutSignal(),
  cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Plex API request failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { id: number; code: string };
  const authUrl = `https://app.plex.tv/auth#?clientID=${encodeURIComponent(
    clientId
  )}&code=${encodeURIComponent(data.code)}&context[device][product]=Portarr`;
  return { pinId: data.id, code: data.code, authUrl };
}

export async function pollPin(
  pinId: number,
  clientId: string,
  fetchFn: typeof fetch = fetch
): Promise<string | null> {
  const res = await fetchFn(`https://plex.tv/api/v2/pins/${pinId}`, {
    headers: PLEX_HEADERS(clientId),
    signal: timeoutSignal(),
  cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Plex API request failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { authToken: string | null };
  return data.authToken ?? null;
}

export async function getPlexIdentity(
  userToken: string,
  clientId: string,
  fetchFn: typeof fetch = fetch
): Promise<{ plexId: string; email: string; username: string }> {
  const res = await fetchFn('https://plex.tv/api/v2/user', {
    headers: { ...PLEX_HEADERS(clientId), 'X-Plex-Token': userToken },
    signal: timeoutSignal(),
  cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Plex API request failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { id: number; email: string; username: string };
  return { plexId: String(data.id), email: data.email, username: data.username };
}

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });

export async function getSharedUsers(
  serverToken: string,
  serverName: string,
  fetchFn: typeof fetch = fetch
): Promise<PlexSharedUser[]> {
  const res = await fetchFn(`https://plex.tv/api/users?X-Plex-Token=${serverToken}`, {
    signal: timeoutSignal(),
  cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Plex API request failed: ${res.status} ${res.statusText}`);
  }
  const xml = await res.text();
  const parsed = xmlParser.parse(xml) as {
    MediaContainer?: { User?: unknown };
  };
  const rawUsers = parsed.MediaContainer?.User;
  const users = Array.isArray(rawUsers) ? rawUsers : rawUsers ? [rawUsers] : [];

  const result: PlexSharedUser[] = [];
  for (const u of users as Array<Record<string, unknown>>) {
    const servers = u.Server;
    const serverList = Array.isArray(servers) ? servers : servers ? [servers] : [];
    const isShared = serverList.some(
      (s) => (s as Record<string, unknown>).name === serverName
    );
    if (isShared) {
      result.push({
        plexId: String(u.id),
        email: String(u.email ?? ''),
        username: String(u.username ?? ''),
      });
    }
  }
  return result;
}

// Cached wrapper around getSharedUsers, keyed independently of any one
// session — every caller within the TTL window shares the same list instead
// of each triggering its own Plex API call.
async function fetchSharedUsersCached(
  serverToken: string,
  serverName: string,
  fetchFn: typeof fetch
): Promise<PlexSharedUser[]> {
  return withTtlCache(
    `shared-users:${serverName}`,
    SESSION_REVALIDATION_TTL_MS,
    () => getSharedUsers(serverToken, serverName, fetchFn)
  );
}

// Re-checks that a non-owner session's Plex account still has an active share
// on this server — the actual fix for sessions never being re-verified after
// login. Owner sessions are never re-checked here: the owner's identity comes
// from PLEX_SERVER_TOKEN itself (an infra config value, not something plex.tv
// "revokes" the way a friend's share can be removed) — see resolvePinToSession.
//
// Fails OPEN on a Plex/network error (returns true): an upstream hiccup during
// this check must not lock out every non-owner session at once, consistent
// with the rest of this app's tolerance for upstream failures.
export async function isStillSharedUser(
  plexId: string,
  serverToken: string,
  serverName: string,
  fetchFn: typeof fetch = fetch
): Promise<boolean> {
  try {
    const shared = await fetchSharedUsersCached(serverToken, serverName, fetchFn);
    return shared.some((u) => u.plexId === plexId);
  } catch (err) {
    console.error('Failed to re-verify Plex share, allowing session through:', err);
    return true;
  }
}

const toArray = (v: unknown) => (Array.isArray(v) ? v : v ? [v] : []);

export async function getRecentlyAdded(
  plexUrl: string,
  serverToken: string,
  count: number,
  fetchFn: typeof fetch = fetch
): Promise<RecentlyAddedItem[]> {
  return withTtlCache(`recently-added:${plexUrl}:${count}`, DEFAULT_CACHE_TTL_MS, async () => {
    // Preserve the original scaling: a raw batch generous enough that even if
    // one media type dominates the freshest additions, the merged+sliced
    // result isn't starved of the other type. getRecentlyAddedSplit below
    // doesn't need this — each type is sliced independently there.
    const rawContainerSize = Math.max(count * 3, 50);
    const { movies, episodes } = await fetchRecentlyAddedByType(plexUrl, serverToken, rawContainerSize, fetchFn);
    return [...movies, ...episodes]
      .sort((a, b) => Date.parse(b.addedAt) - Date.parse(a.addedAt))
      .slice(0, count);
  });
}

export interface RecentlyAddedSplit {
  movies: RecentlyAddedItem[];
  episodes: RecentlyAddedItem[];
}

// Same source data as getRecentlyAdded, kept as two separate lists instead of
// merged-then-sliced — for a dashboard layout that shows movies and shows as
// their own sections rather than one interleaved feed. Cached and keyed
// separately from getRecentlyAdded (different shape, different consumers —
// this one page.tsx, that one also newsletter.ts).
export async function getRecentlyAddedSplit(
  plexUrl: string,
  serverToken: string,
  countPerType: number,
  fetchFn: typeof fetch = fetch
): Promise<RecentlyAddedSplit> {
  return withTtlCache(`recently-added-split:${plexUrl}:${countPerType}`, DEFAULT_CACHE_TTL_MS, async () => {
    // Each type is sliced independently below, so the raw batch only needs to
    // cover this type's own count — no need to over-fetch for the other
    // type's sake the way the merged getRecentlyAdded does.
    const rawContainerSize = Math.max(countPerType * 3, 50);
    const { movies, episodes } = await fetchRecentlyAddedByType(plexUrl, serverToken, rawContainerSize, fetchFn);
    return {
      movies: movies.slice(0, countPerType),
      episodes: episodes.slice(0, countPerType),
    };
  });
}

async function fetchRecentlyAddedByType(
  plexUrl: string,
  serverToken: string,
  rawContainerSize: number,
  fetchFn: typeof fetch
): Promise<RecentlyAddedSplit> {
  const fetchHub = async (type: 1 | 2) => {
    // NOTE: unlike the legacy /library/* endpoints, this Hub endpoint ignores
    // X-Plex-Container-Size/-Start as query params and dumps the ENTIRE
    // library (seen in practice: 1390 movies) — it only honors them as HTTP
    // headers. Also request JSON: with the unbounded XML response above,
    // fast-xml-parser's entity-expansion guard tripped on the sheer number of
    // accented-character entities across that many summaries.
    const res = await fetchFn(`${plexUrl}/hubs/home/recentlyAdded?type=${type}&X-Plex-Token=${serverToken}`, {
      headers: {
        Accept: 'application/json',
        'X-Plex-Container-Start': '0',
        'X-Plex-Container-Size': String(rawContainerSize),
      },
      signal: timeoutSignal(),
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`Plex API request failed: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as { MediaContainer?: { Metadata?: unknown } };
    return toArray(data.MediaContainer?.Metadata) as Array<Record<string, unknown>>;
  };

  // We used to read the legacy /library/recentlyAdded endpoint, which returns
  // new TV content as <Directory type="season"> nodes stamped with the addedAt
  // of when the SEASON entry was first created — not when its latest episode
  // was added. A show already in the library that gets a new episode never
  // bumps that timestamp and never resurfaces, so the widget silently froze
  // every time new episodes landed on an existing season (confirmed against
  // this server: /library/recentlyAdded topped out a full day stale while
  // /library/sections/<tv>/recentlyAdded already had a same-day episode).
  // The Hubs API Plex's own clients use for the home dashboard
  // (/hubs/home/recentlyAdded?type=1|2) returns real per-episode entries with
  // correct addedAt, so newly added episodes of existing seasons show up.
  const [movies, tv, machineIdentifier] = await Promise.all([
    fetchHub(1),
    fetchHub(2),
    getMachineIdentifier(plexUrl, serverToken, fetchFn),
  ]);

  const fromMovies = movies
    .map((v) => ({
      title: String(v.title),
      thumbPath: String(v.thumb),
      addedAtRaw: Number(v.addedAt),
      type: 'movie' as RecentlyAddedItem['type'],
      ratingKey: v.ratingKey != null ? String(v.ratingKey) : null,
    }))
    .sort((a, b) => b.addedAtRaw - a.addedAtRaw);

  // The TV hub mixes three grouping levels depending on how many new items a
  // show got: a single new episode ("episode"), several new episodes of one
  // season collapsed into one row ("season"), or enough new content to
  // collapse the whole show into one row ("show"). Each level names/posters
  // itself differently, so resolve both per-item rather than assuming one shape.
  const fromTv = tv
    .map((v) => {
      const isEpisode = v.type === 'episode';
      // Episode rows show the season poster/title (see thumbPath below), so
      // link to the season's own detail page (parentRatingKey), not the
      // episode's. Season/show rows already are the level being displayed,
      // so their own ratingKey is the right link target.
      const rawRatingKey = isEpisode ? v.parentRatingKey : v.ratingKey;
      return {
        title: String(isEpisode ? v.grandparentTitle : (v.parentTitle ?? v.title)),
        // Episode rows: use the season poster (portrait), not the episode's own
        // still frame (landscape). Season/show rows: their own thumb already is
        // the right poster for that level.
        thumbPath: String(isEpisode ? (v.parentThumb ?? v.thumb) : v.thumb),
        addedAtRaw: Number(v.addedAt),
        type: 'episode' as RecentlyAddedItem['type'],
        ratingKey: rawRatingKey != null ? String(rawRatingKey) : null,
      };
    })
    .sort((a, b) => b.addedAtRaw - a.addedAtRaw);

  const toItem = (v: {
    title: string;
    thumbPath: string;
    addedAtRaw: number;
    type: RecentlyAddedItem['type'];
    ratingKey: string | null;
  }) => ({
    title: v.title,
    thumbPath: v.thumbPath,
    addedAt: new Date(v.addedAtRaw * 1000).toISOString(),
    type: v.type,
    plexWebUrl: machineIdentifier && v.ratingKey ? buildPlexWebUrl(plexUrl, machineIdentifier, v.ratingKey) : null,
  });

  return {
    movies: fromMovies.map(toItem),
    episodes: fromTv.map(toItem),
  };
}

export interface SearchResultItem {
  title: string;
  year: number | null;
  type: 'movie' | 'show';
  thumbPath: string | null;
  /** Deep link into this server's own Plex Web instance, or null if the
   * machineIdentifier lookup failed — callers must treat that as "not
   * clickable" rather than link to a broken URL. */
  plexWebUrl: string | null;
}

interface HubResultEntry {
  title?: string;
  year?: number;
  thumb?: string;
  ratingKey?: string;
}

interface Hub {
  type?: string;
  Metadata?: HubResultEntry[] | HubResultEntry;
}

// The server's machineIdentifier never changes for a running Plex Media
// Server — cached for an hour so every search keystroke doesn't re-fetch it,
// without needing a separate one-time-setup step.
const MACHINE_ID_CACHE_TTL_MS = 60 * 60 * 1000;

async function getMachineIdentifier(
  plexUrl: string,
  serverToken: string,
  fetchFn: typeof fetch
): Promise<string | null> {
  try {
    return await withTtlCache(`machine-id:${plexUrl}`, MACHINE_ID_CACHE_TTL_MS, async () => {
      const res = await fetchFn(`${plexUrl}/identity?X-Plex-Token=${serverToken}`, {
        headers: { Accept: 'application/json' },
        signal: timeoutSignal(),
        cache: 'no-store',
      });
      if (!res.ok) {
        throw new Error(`Plex API request failed: ${res.status} ${res.statusText}`);
      }
      const data = (await res.json()) as { MediaContainer?: { machineIdentifier?: string } };
      const id = data.MediaContainer?.machineIdentifier;
      if (!id) throw new Error('Plex /identity response had no machineIdentifier');
      return id;
    });
  } catch (err) {
    console.error('Failed to resolve Plex machineIdentifier, search results will not be clickable:', err);
    return null;
  }
}

function buildPlexWebUrl(plexUrl: string, machineIdentifier: string, ratingKey: string): string {
  const key = encodeURIComponent(`/library/metadata/${ratingKey}`);
  return `${plexUrl}/web/index.html#!/server/${machineIdentifier}/details?key=${key}`;
}

// Global search — the same Hub endpoint Plex's own UI uses for its search box
// (/hubs/search), not the older /library/search (which needs a section id per
// call and can't search across every library at once). Deliberately narrowed
// to movie/show hubs: the same query also returns actor/episode/collection/
// playlist hubs, which don't fit a simple "find something in the library"
// search box and would need per-type result rendering to not look broken.
export async function searchLibrary(
  plexUrl: string,
  serverToken: string,
  query: string,
  fetchFn: typeof fetch = fetch
): Promise<SearchResultItem[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const [res, machineIdentifier] = await Promise.all([
    fetchFn(`${plexUrl}/hubs/search?query=${encodeURIComponent(trimmed)}&limit=10&X-Plex-Token=${serverToken}`, {
      headers: { Accept: 'application/json' },
      signal: timeoutSignal(),
      cache: 'no-store',
    }),
    getMachineIdentifier(plexUrl, serverToken, fetchFn),
  ]);
  if (!res.ok) {
    throw new Error(`Plex API request failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { MediaContainer?: { Hub?: Hub[] | Hub } };
  const hubs = toArray(data.MediaContainer?.Hub) as Hub[];

  const results: SearchResultItem[] = [];
  for (const hub of hubs) {
    if (hub.type !== 'movie' && hub.type !== 'show') continue;
    for (const entry of toArray(hub.Metadata) as HubResultEntry[]) {
      results.push({
        title: entry.title ?? '',
        year: entry.year ?? null,
        type: hub.type,
        thumbPath: entry.thumb ?? null,
        plexWebUrl:
          machineIdentifier && entry.ratingKey
            ? buildPlexWebUrl(plexUrl, machineIdentifier, entry.ratingKey)
            : null,
      });
    }
  }
  return results;
}
