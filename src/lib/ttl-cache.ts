// Generic short-TTL, in-memory cache for dashboard upstream calls (Tautulli/Plex/
// Sonarr/Radarr). The dashboard makes ~10 upstream calls per load — this cuts that
// down when several users load the dashboard within the same short window, and
// protects upstream from a single user hammering refresh.
//
// Deliberately NOT used for Tautulli's get_activity ("Now Playing") — caching that
// endpoint reintroduces the exact staleness bug fixed in PR #24/#25 (a stale
// "Now Playing" that looked broken with no visible error). Real-time-by-nature
// data must stay uncached; everything here is data that's fine to be up to
// DEFAULT_CACHE_TTL_MS old.

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export const DEFAULT_CACHE_TTL_MS = 60_000;

const store = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

export function resetTtlCacheForTests(): void {
  store.clear();
  inFlight.clear();
}

export async function withTtlCache<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>
): Promise<T> {
  const cached = store.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as T;
  }

  // Concurrent callers during a miss share one in-flight upstream call instead
  // of each firing their own — the scenario this cache exists for in the first
  // place (several dashboard loads landing at once).
  const pending = inFlight.get(key);
  if (pending) {
    return pending as Promise<T>;
  }

  const promise = fn()
    .then((value) => {
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    })
    .finally(() => {
      inFlight.delete(key);
    });
  inFlight.set(key, promise);
  return promise;
}
