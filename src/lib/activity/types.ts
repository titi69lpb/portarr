import type { ProviderId } from '../media/types';

export const ACTIVITY_TIMEOUT_MS = 12000;

export interface ActiveSession {
  title: string;
  showTitle: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  year: string;
  mediaType: 'movie' | 'episode' | 'track' | 'other';
  user: string;
  player: string;
  bandwidthKbps: number;
  transcodeDecision: 'direct play' | 'copy' | 'transcode';
  viewOffsetMs: number;
  durationMs: number;
  state: 'playing' | 'paused' | 'buffering';
  posterPath: string;
}

export interface PersonalStats {
  plays: number;
  totalDurationSeconds: number;
}

export interface PersonalStatsByType {
  movies: { count: number; hours: number };
  episodes: { count: number; hours: number };
}

export interface RecentHistoryItem {
  title: string;
  type: 'movie' | 'episode';
  thumbPath: string;
  watchedAt: string;
}

export interface WatchHistoryPage {
  items: RecentHistoryItem[];
  total: number;
}

export interface GlobalStat {
  title: string;
  value: number;
  posterPath?: string;
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

export const EMPTY_GLOBAL_STATS: Record<StatCategory, GlobalStat[]> = {
  topMovies: [],
  popularMovies: [],
  topTv: [],
  popularTv: [],
  topLibraries: [],
  topUsers: [],
  topPlatforms: [],
  mostConcurrent: [],
};

/** Every field an ActivitySource needs to identify a member. SessionUser (src/lib/session.ts)
 * and MediaMember (src/lib/media/types.ts) both satisfy this structurally — callers pass either
 * directly, no conversion needed. */
export interface ActivityMember {
  provider: ProviderId;
  userId: string;
  email: string;
  username: string;
}

export interface ActivitySource {
  readonly id: ProviderId;
  nowPlaying(): Promise<ActiveSession[]>;
  /** ISO timestamp of the member's last seen activity, or null if never seen / unknown. */
  lastSeen(member: ActivityMember): Promise<string | null>;
  personalStats(member: ActivityMember): Promise<PersonalStats | null>;
  personalStatsByType(member: ActivityMember): Promise<PersonalStatsByType>;
  recentHistory(member: ActivityMember, limit: number): Promise<RecentHistoryItem[]>;
  historyPage(member: ActivityMember, offset: number, limit: number): Promise<WatchHistoryPage>;
  globalStats(): Promise<Record<StatCategory, GlobalStat[]>>;
}
