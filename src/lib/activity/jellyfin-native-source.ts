import { getSessions, jellyfinPosterRef, type JellyfinProviderConfig, type JellyfinSession } from '../media/jellyfin';
import type { ActiveSession, ActivitySource } from './types';
import { EMPTY_GLOBAL_STATS } from './types';

// Ticks are 100-nanosecond units (Jellyfin/`.NET` convention); /10000 gives ms.
const TICKS_PER_MS = 10000;

export function mapJellyfinSessionToActiveSession(session: JellyfinSession): ActiveSession {
  const isEpisode = session.item.type === 'Episode' && session.item.seriesName !== null;
  const transcodeDecision: ActiveSession['transcodeDecision'] =
    session.playMethod === 'Transcode' ? 'transcode' : session.playMethod === 'DirectStream' ? 'copy' : 'direct play';
  return {
    title: isEpisode ? (session.item.seriesName as string) : session.item.name,
    showTitle: isEpisode ? session.item.name : null,
    seasonNumber: isEpisode ? session.item.seasonNumber : null,
    episodeNumber: isEpisode ? session.item.episodeNumber : null,
    year: session.item.productionYear !== null ? String(session.item.productionYear) : '',
    mediaType: session.item.type === 'Movie' ? 'movie' : session.item.type === 'Episode' ? 'episode' : session.item.type === 'Audio' ? 'track' : 'other',
    user: session.userName,
    player: session.deviceName,
    bandwidthKbps: session.transcodingBitrate ? Math.round(session.transcodingBitrate / 1000) : 0,
    transcodeDecision,
    viewOffsetMs: Math.round(session.positionTicks / TICKS_PER_MS),
    durationMs: session.item.runTimeTicks ? Math.round(session.item.runTimeTicks / TICKS_PER_MS) : 0,
    state: session.isPaused ? 'paused' : 'playing',
    posterPath: jellyfinPosterRef(isEpisode && session.item.seasonId ? session.item.seasonId : session.item.id),
  };
}

// This mode implements now-playing only. Every other ActivitySource method is
// a deliberate empty/null degradation: without Jellystat (task 5), Portarr has
// no history/stats backend for Jellyfin, and that is documented, not a bug.
export function createJellyfinNativeActivitySource(
  cfg: JellyfinProviderConfig,
  fetchFn: typeof fetch = fetch
): ActivitySource {
  return {
    id: 'jellyfin',
    supportsLastSeen: false,
    async nowPlaying() {
      const sessions = await getSessions(cfg, fetchFn);
      return sessions.map(mapJellyfinSessionToActiveSession);
    },
    lastSeen: async () => null,
    personalStats: async () => null,
    personalStatsByType: async () => ({ movies: { count: 0, hours: 0 }, episodes: { count: 0, hours: 0 } }),
    recentHistory: async () => [],
    historyPage: async () => ({ items: [], total: 0 }),
    globalStats: async () => EMPTY_GLOBAL_STATS,
  };
}
