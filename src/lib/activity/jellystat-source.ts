import {
  getJellystatSessionsRaw,
  getMostActiveUsers,
  getMostPopularByType,
  getMostViewedByType,
  getMostViewedLibraries,
  getUserHistoryPage,
  listMemberActivity,
  type JellystatConfig,
} from './jellystat';
import { mapJellyfinSessionToActiveSession } from './jellyfin-native-source';
import { normalizeJellyfinSessions } from '../media/jellyfin';
import type { ActivitySource } from './types';

const normalizeId = (id: string) => id.toLowerCase().replace(/-/g, '');

export function createJellystatActivitySource(cfg: JellystatConfig, fetchFn: typeof fetch = fetch): ActivitySource {
  return {
    id: 'jellyfin',
    supportsLastSeen: true,
    async nowPlaying() {
      const raw = await getJellystatSessionsRaw(cfg, fetchFn);
      return normalizeJellyfinSessions(raw).map(mapJellyfinSessionToActiveSession);
    },
    async lastSeen(member) {
      const activity = await listMemberActivity(cfg, fetchFn);
      const match = activity.find((a) => normalizeId(a.userId) === normalizeId(member.userId));
      return match?.lastSeenAt ?? null;
    },
    async personalStats(member) {
      const activity = await listMemberActivity(cfg, fetchFn);
      const match = activity.find((a) => normalizeId(a.userId) === normalizeId(member.userId));
      return match ? { plays: match.totalPlays, totalDurationSeconds: match.totalWatchTimeSeconds } : null;
    },
    // Jellystat's getAllUserActivity gives total plays/time, not a movies/episodes
    // split, and getUserHistory has no per-type filter to derive one from cheaply.
    // Deliberate simplification: no per-type stats for the Jellystat source.
    personalStatsByType: async () => ({ movies: { count: 0, hours: 0 }, episodes: { count: 0, hours: 0 } }),
    recentHistory: (member, limit) => getUserHistoryPage(cfg, member.userId, 1, limit, fetchFn).then((p) => p.items),
    historyPage: (member, offset, limit) => getUserHistoryPage(cfg, member.userId, Math.floor(offset / limit) + 1, limit, fetchFn),
    async globalStats() {
      const [topMovies, topTv, popularMovies, popularTv, topLibraries, topUsers] = await Promise.all([
        getMostViewedByType(cfg, 'Movie', fetchFn),
        getMostViewedByType(cfg, 'Series', fetchFn),
        getMostPopularByType(cfg, 'Movie', fetchFn),
        getMostPopularByType(cfg, 'Series', fetchFn),
        getMostViewedLibraries(cfg, fetchFn),
        getMostActiveUsers(cfg, fetchFn),
      ]);
      return { topMovies, popularMovies, topTv, popularTv, topLibraries, topUsers, topPlatforms: [], mostConcurrent: [] };
    },
  };
}
