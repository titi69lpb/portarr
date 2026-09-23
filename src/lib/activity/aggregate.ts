import type { ActiveSession, ActivitySource, GlobalStat, StatCategory } from './types';
import { EMPTY_GLOBAL_STATS } from './types';

// Runs `fn` on every source. A failing source is logged and skipped so one dead
// server never blanks the whole page; matches src/lib/media/aggregate.ts's `collect`.
async function collect<T>(sources: ActivitySource[], fn: (s: ActivitySource) => Promise<T>): Promise<T[]> {
  const results = await Promise.allSettled(sources.map(fn));
  const ok: T[] = [];
  let failure: { reason: unknown } | null = null;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') {
      ok.push(r.value);
    } else {
      console.error(`Activity source "${sources[i].id}" failed:`, r.reason);
      failure ??= { reason: r.reason };
    }
  }
  if (ok.length === 0 && failure) throw failure.reason;
  return ok;
}

export async function nowPlayingAll(sources: ActivitySource[]): Promise<ActiveSession[]> {
  return (await collect(sources, (s) => s.nowPlaying())).flat();
}

const CATEGORIES: StatCategory[] = [
  'topMovies',
  'popularMovies',
  'topTv',
  'popularTv',
  'topLibraries',
  'topUsers',
  'topPlatforms',
  'mostConcurrent',
];
const MERGED_CAP = 10;

export async function globalStatsAll(sources: ActivitySource[]): Promise<Record<StatCategory, GlobalStat[]>> {
  const perSource = await collect(sources, (s) => s.globalStats());
  const merged = { ...EMPTY_GLOBAL_STATS };
  for (const category of CATEGORIES) {
    merged[category] = perSource
      .flatMap((r) => r[category])
      .sort((a, b) => b.value - a.value)
      .slice(0, MERGED_CAP);
  }
  return merged;
}
