import { timeoutSignal } from '../fetch-timeout';
import { withTtlCache, DEFAULT_CACHE_TTL_MS } from '../ttl-cache';
import { ACTIVITY_TIMEOUT_MS } from './types';
import type { ActiveSession, ActivityMember, ActivitySource, GlobalStat, PersonalStats, PersonalStatsByType, RecentHistoryItem, StatCategory, WatchHistoryPage } from './types';
export { ACTIVITY_TIMEOUT_MS } from './types';
export type { ActiveSession, GlobalStat, PersonalStats, PersonalStatsByType, RecentHistoryItem, StatCategory, WatchHistoryPage } from './types';

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
        // A single request with `length` truncates strictly by recency across
        // ALL media types before we ever see the data — a real prod case
        // showed a user's last several dozen plays ALL episodes (bingeing
        // several shows back to back), which meant even a generous over-fetch
        // window (previously length=40 combined) still contained zero movies,
        // so no amount of client-side rebalancing could surface one — the
        // movies simply weren't in the fetched set at all. Fixed by querying
        // each media type separately (Tautulli's `media_type` filter, already
        // used by fetchMediaTypeStats above) so up to `limit` of the user's
        // most recent movies are ALWAYS in hand regardless of how many
        // episodes they watched since, then balanceRecentHistory picks the
        // fair mix from that guaranteed-complete pool.
        const fetchType = async (mediaType: 'movie' | 'episode') => {
          const res = await fetchFn(
            `${tautulliUrl}/api/v2?apikey=${apiKey}&cmd=get_history&user_id=${userId}&media_type=${mediaType}&length=${limit}&order_column=date&order_dir=desc`,
            { signal: timeoutSignal(), cache: 'no-store' }
          );
          if (!res.ok) {
            throw new Error(`Tautulli API request failed: ${res.status} ${res.statusText}`);
          }
          const data = (await res.json()) as { response: { data: { data: RecentHistoryRow[] } } };
          return data.response.data.data.filter((row) => row.thumb).map(rowToHistoryItem);
        };
        const [movies, episodes] = await Promise.all([fetchType('movie'), fetchType('episode')]);
        return balanceRecentHistory([...movies, ...episodes], limit);
      }
    );
  } catch {
    return [];
  }
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

interface TautulliSession {
  title: string;
  grandparent_title: string;
  parent_media_index: string;
  media_index: string;
  year: string;
  media_type: string;
  user: string;
  player: string;
  bandwidth: string;
  transcode_decision: string;
  view_offset: string;
  duration: string;
  state: string;
  thumb: string;
  grandparent_thumb: string;
}

export async function getActiveSessions(
  tautulliUrl: string,
  apiKey: string,
  fetchFn: typeof fetch = fetch
): Promise<ActiveSession[]> {
  const res = await fetchFn(`${tautulliUrl}/api/v2?apikey=${apiKey}&cmd=get_activity`, {
    signal: timeoutSignal(ACTIVITY_TIMEOUT_MS),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Tautulli API request failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { response: { data: { sessions: TautulliSession[] } } };

  return data.response.data.sessions.map((s) => {
    const isEpisode = s.media_type === 'episode' && s.grandparent_title !== '';
    return {
      title: isEpisode ? s.grandparent_title : s.title,
      showTitle: isEpisode ? s.title : null,
      seasonNumber: isEpisode ? Number(s.parent_media_index) : null,
      episodeNumber: isEpisode ? Number(s.media_index) : null,
      year: s.year,
      mediaType: (['movie', 'episode', 'track'].includes(s.media_type)
        ? s.media_type
        : 'other') as ActiveSession['mediaType'],
      user: s.user,
      player: s.player,
      bandwidthKbps: Number(s.bandwidth),
      transcodeDecision: s.transcode_decision as ActiveSession['transcodeDecision'],
      viewOffsetMs: Number(s.view_offset),
      durationMs: Number(s.duration),
      state: s.state as ActiveSession['state'],
      posterPath: isEpisode ? s.grandparent_thumb : s.thumb,
    };
  });
}

export function createTautulliActivitySource(
  cfg: { url: string; apiKey: string },
  fetchFn: typeof fetch = fetch
): ActivitySource {
  return {
    id: 'plex',
    nowPlaying: () => getActiveSessions(cfg.url, cfg.apiKey, fetchFn),
    async lastSeen(member) {
      const activity = await getUserActivity(cfg.url, cfg.apiKey, fetchFn);
      const match = activity.find((a) => a.email === member.email.toLowerCase());
      return match?.lastSeenAt ? match.lastSeenAt.toISOString() : null;
    },
    personalStats: (member) => getPersonalStats(cfg.url, cfg.apiKey, member.email, fetchFn),
    async personalStatsByType(member) {
      const userId = await getUserIdByEmail(cfg.url, cfg.apiKey, member.email, fetchFn);
      if (userId === null) return { movies: { count: 0, hours: 0 }, episodes: { count: 0, hours: 0 } };
      return getPersonalStatsByType(cfg.url, cfg.apiKey, userId, fetchFn);
    },
    async recentHistory(member, limit) {
      const userId = await getUserIdByEmail(cfg.url, cfg.apiKey, member.email, fetchFn);
      if (userId === null) return [];
      return getRecentWatchHistory(cfg.url, cfg.apiKey, userId, limit, fetchFn);
    },
    async historyPage(member, offset, limit) {
      const userId = await getUserIdByEmail(cfg.url, cfg.apiKey, member.email, fetchFn);
      if (userId === null) return { items: [], total: 0 };
      return getWatchHistoryPage(cfg.url, cfg.apiKey, userId, offset, limit, fetchFn);
    },
    globalStats: () => getExtendedStats(cfg.url, cfg.apiKey, fetchFn),
  };
}
