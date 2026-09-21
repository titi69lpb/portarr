import type {
  MediaMember,
  MediaServer,
  RecentlyAddedItem,
  RecentlyAddedSplit,
  SearchResultItem,
} from './types';

// Runs `fn` on every provider. A failing provider is logged and skipped so
// one dead server never blanks the whole page; only when EVERY provider
// fails (and there was at least one) is the first error rethrown, so a
// single-provider install behaves exactly as before (route answers 502).
async function collect<T>(providers: MediaServer[], fn: (p: MediaServer) => Promise<T>): Promise<T[]> {
  const results = await Promise.allSettled(providers.map(fn));
  const ok: T[] = [];
  let failure: { reason: unknown } | null = null;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') {
      ok.push(r.value);
    } else {
      console.error(`Media provider "${providers[i].id}" failed:`, r.reason);
      failure ??= { reason: r.reason };
    }
  }
  if (ok.length === 0 && failure) throw failure.reason;
  return ok;
}

const byAddedAtDesc = (a: RecentlyAddedItem, b: RecentlyAddedItem) => Date.parse(b.addedAt) - Date.parse(a.addedAt);

export async function searchAll(providers: MediaServer[], query: string): Promise<SearchResultItem[]> {
  return (await collect(providers, (p) => p.search(query))).flat();
}

export async function recentlyAddedAll(providers: MediaServer[], count: number): Promise<RecentlyAddedItem[]> {
  const lists = await collect(providers, (p) => p.recentlyAdded(count));
  return lists.flat().sort(byAddedAtDesc).slice(0, count);
}

export async function recentlyAddedSplitAll(
  providers: MediaServer[],
  countPerType: number
): Promise<RecentlyAddedSplit> {
  const splits = await collect(providers, (p) => p.recentlyAddedSplit(countPerType));
  return {
    movies: splits.flatMap((s) => s.movies).sort(byAddedAtDesc).slice(0, countPerType),
    episodes: splits.flatMap((s) => s.episodes).sort(byAddedAtDesc).slice(0, countPerType),
  };
}

export async function listMembersAll(providers: MediaServer[]): Promise<MediaMember[]> {
  return (await collect(providers, (p) => p.listMembers())).flat();
}
