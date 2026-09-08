import { timeoutSignal } from './fetch-timeout';
import { withTtlCache, DEFAULT_CACHE_TTL_MS } from './ttl-cache';

export interface GlobalStat {
  title: string;
  value: number;
  posterPath?: string;
}

export interface PersonalStats {
  plays: number;
  totalDurationSeconds: number;
}

interface UserTableRow {
  email?: string;
  plays?: number;
  duration?: number;
  last_seen?: number | null;
  user_id?: number;
}

// getPersonalStats/getUserIdByEmail/getUserActivity all hit the exact same
// get_users_table endpoint — a dashboard load for a logged-in user used to fire
// it twice (once per caller), and the admin members page / mailing target picker
// add more callers still. Shared cached fetch means one upstream call serves all
// of them within the TTL window.
async function fetchUsersTable(
  tautulliUrl: string,
  apiKey: string,
  fetchFn: typeof fetch
): Promise<UserTableRow[]> {
  return withTtlCache(`users-table:${tautulliUrl}`, DEFAULT_CACHE_TTL_MS, async () => {
    const res = await fetchFn(
      `${tautulliUrl}/api/v2?apikey=${apiKey}&cmd=get_users_table&length=300`,
      { signal: timeoutSignal(), cache: 'no-store' }
    );
    if (!res.ok) {
      throw new Error(`Tautulli API request failed: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as { response: { data: { data: UserTableRow[] } } };
    return data.response.data.data;
  });
}

export async function getPersonalStats(
  tautulliUrl: string,
  apiKey: string,
  email: string,
  fetchFn: typeof fetch = fetch
): Promise<PersonalStats | null> {
  if (!email) return null;
  const rows = await fetchUsersTable(tautulliUrl, apiKey, fetchFn);
  const match = rows.find((row) => (row.email ?? '').toLowerCase() === email.toLowerCase());
  if (!match) return null;
  return { plays: match.plays ?? 0, totalDurationSeconds: match.duration ?? 0 };
}

export async function getUserIdByEmail(
  tautulliUrl: string,
  apiKey: string,
  email: string,
  fetchFn: typeof fetch = fetch
): Promise<number | null> {
  if (!email) return null;
  const rows = await fetchUsersTable(tautulliUrl, apiKey, fetchFn);
  const match = rows.find((row) => (row.email ?? '').toLowerCase() === email.toLowerCase());
  return match?.user_id ?? null;
}

export interface UserActivity {
  email: string;
  lastSeenAt: Date | null;
}

export async function getUserActivity(
  tautulliUrl: string,
  apiKey: string,
  fetchFn: typeof fetch = fetch
): Promise<UserActivity[]> {
  const rows = await fetchUsersTable(tautulliUrl, apiKey, fetchFn);
  return rows
    .filter((row) => !!row.email)
    .map((row) => ({
      email: (row.email as string).toLowerCase(),
      lastSeenAt: row.last_seen ? new Date(row.last_seen * 1000) : null,
    }));
}

export type StatCategory =
  | 'topMovies'
  | 'popularMovies'
  | 'topTv'
  | 'popularTv'
  | 'topLibraries'
  | 'topUsers'
  | 'topPlatforms'
  | 'mostConcurrent';

interface ExtendedStatRow {
  title?: string;
  section_name?: string;
  friendly_name?: string;
  platform_name?: string;
  users_watched?: number;
  total_plays?: number;
  count?: number;
  thumb?: string;
  grandparent_thumb?: string;
}

const STAT_ID_TO_CATEGORY: Record<string, StatCategory> = {
  top_movies: 'topMovies',
  popular_movies: 'popularMovies',
  top_tv: 'topTv',
  popular_tv: 'popularTv',
  top_libraries: 'topLibraries',
  top_users: 'topUsers',
  top_platforms: 'topPlatforms',
  most_concurrent: 'mostConcurrent',
};

// Rows can have multiple value-shaped fields populated simultaneously (e.g. a real
// popular_tv row carries both total_plays and users_watched). The correct field is
// determined by which category is being built, never by which field happens to be set.
const VALUE_FIELD_BY_CATEGORY: Record<StatCategory, 'users_watched' | 'total_plays' | 'count'> = {
  topMovies: 'total_plays',
  popularMovies: 'users_watched',
  topTv: 'total_plays',
  popularTv: 'users_watched',
  topLibraries: 'total_plays',
  topUsers: 'total_plays',
  topPlatforms: 'total_plays',
  mostConcurrent: 'count',
};

const MEDIA_CATEGORIES: ReadonlySet<StatCategory> = new Set([
  'topMovies',
  'popularMovies',
  'topTv',
  'popularTv',
]);

function rowToStat(row: ExtendedStatRow, category: StatCategory): GlobalStat {
  // `??` only falls through on null/undefined — but Tautulli's home_stats rows
  // carry EVERY one of these fields on EVERY row, just empty ('') for whichever
  // don't apply to that row's category (e.g. a movie row has friendly_name: '').
  // `??` stopped at the first *present* field, even when it was an empty
  // string, discarding the real title. `||` treats '' as "keep looking", which
  // is what this fallback chain actually needs.
  const title = row.section_name || row.friendly_name || row.platform_name || row.title || '';
  const value = row[VALUE_FIELD_BY_CATEGORY[category]] ?? 0;
  const posterPath = MEDIA_CATEGORIES.has(category)
    ? row.grandparent_thumb || row.thumb || undefined
    : undefined;
  return posterPath ? { title, value, posterPath } : { title, value };
}

export async function getExtendedStats(
  tautulliUrl: string,
  apiKey: string,
  fetchFn: typeof fetch = fetch
): Promise<Record<StatCategory, GlobalStat[]>> {
  return withTtlCache(`home-stats:${tautulliUrl}`, DEFAULT_CACHE_TTL_MS, async () => {
    const res = await fetchFn(
      `${tautulliUrl}/api/v2?apikey=${apiKey}&cmd=get_home_stats&grouping=1&time_range=365`,
      { signal: timeoutSignal(), cache: 'no-store' }
    );
    if (!res.ok) {
      throw new Error(`Tautulli API request failed: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as {
      response: { data: { stat_id: string; rows: ExtendedStatRow[] }[] };
    };

    const result = {
      topMovies: [],
      popularMovies: [],
      topTv: [],
      popularTv: [],
      topLibraries: [],
      topUsers: [],
      topPlatforms: [],
      mostConcurrent: [],
    } as Record<StatCategory, GlobalStat[]>;

    for (const block of data.response.data) {
      const category = STAT_ID_TO_CATEGORY[block.stat_id];
      if (category) {
        result[category] = block.rows.map((row) => rowToStat(row, category));
      }
    }

    return result;
  });
}

export interface PersonalStatsByType {
  movies: { count: number; hours: number };
  episodes: { count: number; hours: number };
}

interface HistoryRow {
  duration?: number;
}

async function fetchMediaTypeStats(
  tautulliUrl: string,
  apiKey: string,
  userId: number,
  mediaType: 'movie' | 'episode',
  fetchFn: typeof fetch
): Promise<{ count: number; hours: number }> {
  // Failures must NOT be cached — throwing inside (instead of returning the
  // {count:0,hours:0} fallback) keeps withTtlCache from storing a zero result
  // that would otherwise mask a transient upstream failure for a full TTL window.
  try {
    return await withTtlCache(
      `history-stats:${tautulliUrl}:${userId}:${mediaType}`,
      DEFAULT_CACHE_TTL_MS,
      async () => {
        const res = await fetchFn(
          `${tautulliUrl}/api/v2?apikey=${apiKey}&cmd=get_history&user_id=${userId}&media_type=${mediaType}&length=500`,
          { signal: timeoutSignal(), cache: 'no-store' }
        );
        if (!res.ok) {
          throw new Error(`Tautulli API request failed: ${res.status} ${res.statusText}`);
        }
        const data = (await res.json()) as {
          response: { data: { recordsFiltered: number; data: HistoryRow[] } };
        };
        const rowsReturned = data.response.data.data.length;
        const totalSeconds = data.response.data.data.reduce((sum, row) => sum + (row.duration ?? 0), 0);
        const estimatedTotalSeconds =
          rowsReturned > 0 ? (totalSeconds / rowsReturned) * data.response.data.recordsFiltered : 0;
        return { count: data.response.data.recordsFiltered, hours: estimatedTotalSeconds / 3600 };
      }
    );
  } catch {
    return { count: 0, hours: 0 };
  }
}

export async function getPersonalStatsByType(
  tautulliUrl: string,
  apiKey: string,
  userId: number,
  fetchFn: typeof fetch = fetch
): Promise<PersonalStatsByType> {
  const [movies, episodes] = await Promise.all([
    fetchMediaTypeStats(tautulliUrl, apiKey, userId, 'movie', fetchFn),
    fetchMediaTypeStats(tautulliUrl, apiKey, userId, 'episode', fetchFn),
  ]);
  return { movies, episodes };
}

export interface RecentHistoryItem {
  title: string;
  type: 'movie' | 'episode';
  thumbPath: string;
  watchedAt: string;
}

interface RecentHistoryRow {
  media_type?: string;
  title?: string;
  full_title?: string;
  grandparent_title?: string;
  thumb?: string;
  grandparent_thumb?: string;
  date?: number;
}

function rowToHistoryItem(row: RecentHistoryRow): RecentHistoryItem {
  return {
    title: row.media_type === 'episode' ? row.full_title ?? row.title ?? '' : row.title ?? '',
    type: row.media_type as 'movie' | 'episode',
    thumbPath: row.thumb as string,
    watchedAt: row.date ? new Date(row.date * 1000).toISOString() : new Date(0).toISOString(),
  };
}

// Given items already sorted most-recent-first, returns up to `limit` with
// movies and episodes represented as evenly as availability allows — each
// type's own recency order is preserved, they're just interleaved fairly
// instead of one type's binge-watching monopolizing every slot. Exported for
// tests.
export function balanceRecentHistory(
  items: RecentHistoryItem[],
  limit: number
): RecentHistoryItem[] {
  const movies = items.filter((item) => item.type === 'movie');
  const episodes = items.filter((item) => item.type === 'episode');
  const half = Math.ceil(limit / 2);
  const takenMovies = movies.slice(0, half);
  const takenEpisodes = episodes.slice(0, limit - takenMovies.length);
  const remaining = limit - takenMovies.length - takenEpisodes.length;
  const backfill =
    remaining > 0
      ? [...movies.slice(takenMovies.length), ...episodes.slice(takenEpisodes.length)]
          .sort((a, b) => (a.watchedAt < b.watchedAt ? 1 : -1))
          .slice(0, remaining)
      : [];
  return [...takenMovies, ...takenEpisodes, ...backfill].sort((a, b) =>
    a.watchedAt < b.watchedAt ? 1 : -1
  );
}

export async function getRecentWatchHistory(
  tautulliUrl: string,
  apiKey: string,
  userId: number,
  limit: number = 8,
  fetchFn: typeof fetch = fetch
): Promise<RecentHistoryItem[]> {
  // Failures must NOT be cached — see fetchMediaTypeStats above for why.
  try {
    return await withTtlCache(
      `recent-history:${tautulliUrl}:${userId}:${limit}`,
      DEFAULT_CACHE_TTL_MS,
      async () => {
        // Tautulli's `length` truncates strictly by recency across ALL media
        // types before we ever see the data — a user binge-watching a series
        // pushes every movie out of the window even if one was watched just
        // a day ago (reported live: "Vu récemment" showing only episodes).
        // Over-fetch and rebalance client-side so both types get a fair shot
        // at the fixed-size dashboard strip.
        const overfetch = Math.max(limit * 5, 40);
        const res = await fetchFn(
          `${tautulliUrl}/api/v2?apikey=${apiKey}&cmd=get_history&user_id=${userId}&length=${overfetch}&order_column=date&order_dir=desc`,
          { signal: timeoutSignal(), cache: 'no-store' }
        );
        if (!res.ok) {
          throw new Error(`Tautulli API request failed: ${res.status} ${res.statusText}`);
        }
        const data = (await res.json()) as { response: { data: { data: RecentHistoryRow[] } } };
        const items = data.response.data.data
          .filter((row) => (row.media_type === 'movie' || row.media_type === 'episode') && row.thumb)
          .map(rowToHistoryItem);
        return balanceRecentHistory(items, limit);
      }
    );
  } catch {
    return [];
  }
}

export interface WatchHistoryPage {
  items: RecentHistoryItem[];
  total: number;
}

// Full paginated history for the dedicated /history page — getRecentWatchHistory
// above stays fixed at a small `limit` for the dashboard's "Vu récemment" strip
// and is unaffected by this. Not TTL-cached: this page is opened specifically to
// browse older history a user just watched moments ago, so freshness matters
// more here than the dashboard-load-storm cost `withTtlCache` guards against.
export async function getWatchHistoryPage(
  tautulliUrl: string,
  apiKey: string,
  userId: number,
  offset: number,
  limit: number,
  fetchFn: typeof fetch = fetch
): Promise<WatchHistoryPage> {
  const res = await fetchFn(
    `${tautulliUrl}/api/v2?apikey=${apiKey}&cmd=get_history&user_id=${userId}&start=${offset}&length=${limit}&order_column=date&order_dir=desc`,
    { signal: timeoutSignal(), cache: 'no-store' }
  );
  if (!res.ok) {
    throw new Error(`Tautulli API request failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as {
    response: { data: { recordsFiltered: number; data: RecentHistoryRow[] } };
  };
  const items = data.response.data.data
    .filter((row) => (row.media_type === 'movie' || row.media_type === 'episode') && row.thumb)
    .map(rowToHistoryItem);
  return { items, total: data.response.data.recordsFiltered };
}
