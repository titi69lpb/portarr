import type { ActivitySource } from '../../../src/lib/activity/types';
import { EMPTY_GLOBAL_STATS } from '../../../src/lib/activity/types';
import type { ProviderId } from '../../../src/lib/media/types';

export function fakeSource(id: ProviderId, overrides: Partial<ActivitySource> = {}): ActivitySource {
  return {
    id,
    nowPlaying: async () => [],
    lastSeen: async () => null,
    personalStats: async () => null,
    personalStatsByType: async () => ({ movies: { count: 0, hours: 0 }, episodes: { count: 0, hours: 0 } }),
    recentHistory: async () => [],
    historyPage: async () => ({ items: [], total: 0 }),
    globalStats: async () => EMPTY_GLOBAL_STATS,
    ...overrides,
  };
}
