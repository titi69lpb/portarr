import { timeoutSignal } from '../fetch-timeout';
import { withTtlCache, DEFAULT_CACHE_TTL_MS } from '../ttl-cache';
import { jellyfinPosterRef } from '../media/jellyfin';
import type { GlobalStat, RecentHistoryItem, WatchHistoryPage } from './types';

// Structural on purpose, matching media/jellyfin.ts's JellyfinProviderConfig —
// this module is never Edge-reachable (activity/ isn't imported by middleware.ts)
// but keeping the same shape avoids an unnecessary config.ts dependency anyway.
export interface JellystatConfig {
  url: string;
  apiKey: string;
}

// Verified against Jellystat 1.1.12 (2026-09-22): every call carries this header.
function jsHeaders(apiKey: string, json = false): Record<string, string> {
  const headers: Record<string, string> = { 'x-api-token': apiKey, Accept: 'application/json' };
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
}

async function jsGet<T>(cfg: JellystatConfig, path: string, fetchFn: typeof fetch): Promise<T> {
  const res = await fetchFn(`${cfg.url}${path}`, {
    headers: jsHeaders(cfg.apiKey),
    signal: timeoutSignal(),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Jellystat API request failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

async function jsPost<T>(cfg: JellystatConfig, path: string, body: unknown, fetchFn: typeof fetch): Promise<T> {
  const res = await fetchFn(`${cfg.url}${path}`, {
    method: 'POST',
    headers: jsHeaders(cfg.apiKey, true),
    body: JSON.stringify(body),
    signal: timeoutSignal(),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Jellystat API request failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export interface JellystatMemberActivity {
  userId: string;
  lastSeenAt: string | null;
}

interface RawMemberActivity {
  UserId: string;
  LastActivityDate?: string | null;
}

// GET /stats/getAllUserActivity returns every member's activity in one call —
// cached like Tautulli's own equivalent bulk fetch, so N per-member lastSeen()
// calls collapse into one real request per TTL window.
export async function listMemberActivity(cfg: JellystatConfig, fetchFn: typeof fetch = fetch): Promise<JellystatMemberActivity[]> {
  return withTtlCache(`jellystat-activity:${cfg.url}`, DEFAULT_CACHE_TTL_MS, async () => {
    const rows = await jsGet<RawMemberActivity[]>(cfg, '/stats/getAllUserActivity', fetchFn);
    return rows.map((r) => ({ userId: r.UserId, lastSeenAt: r.LastActivityDate ?? null }));
  });
}

interface RawHistoryResult {
  NowPlayingItemName?: string;
  SeriesName?: string | null;
  SeasonId?: string;
  NowPlayingItemId?: string;
  FullName?: string;
  ActivityDateInserted: string;
}

interface RawHistoryResponse {
  pages: number;
  size: number;
  results: RawHistoryResult[];
}

function historyRowToItem(row: RawHistoryResult): RecentHistoryItem {
  const isEpisode = row.SeriesName != null && row.SeriesName !== '';
  const posterItemId = isEpisode ? row.SeasonId : row.NowPlayingItemId;
  return {
    title: row.FullName ?? row.NowPlayingItemName ?? '',
    type: isEpisode ? 'episode' : 'movie',
    thumbPath: posterItemId ? jellyfinPosterRef(posterItemId) : '',
    watchedAt: row.ActivityDateInserted,
  };
}

// POST /api/getUserHistory — not cached (freshness matters more here than the
// dashboard-load-storm cost withTtlCache guards against, matching Tautulli's
// own getWatchHistoryPage). Unlike Tautulli's history endpoints, this API gives
// no per-type filter, so there is no movie/episode fairness balancing here —
// a documented simplification, not the Tautulli-specific bug this codebase
// already fixed once (see tautulli-source.ts's getRecentWatchHistory comment).
export async function getUserHistoryPage(
  cfg: JellystatConfig,
  userId: string,
  page: number,
  size: number,
  fetchFn: typeof fetch = fetch
): Promise<WatchHistoryPage> {
  const data = await jsPost<RawHistoryResponse>(
    cfg,
    `/api/getUserHistory?size=${size}&page=${page}&sort=ActivityDateInserted&desc=true`,
    { userid: userId },
    fetchFn
  );
  return { items: data.results.map(historyRowToItem), total: data.pages * data.size };
}

interface RawTopItem {
  Name: string;
  Plays?: number;
  unique_viewers?: number;
  Id?: string;
  UserId?: string;
}

const BOX_OFFICE_DAYS = 365;

export async function getMostViewedByType(
  cfg: JellystatConfig,
  type: 'Movie' | 'Series',
  fetchFn: typeof fetch = fetch
): Promise<GlobalStat[]> {
  return withTtlCache(`jellystat-viewed:${cfg.url}:${type}`, DEFAULT_CACHE_TTL_MS, async () => {
    const rows = await jsPost<RawTopItem[]>(cfg, '/stats/getMostViewedByType', { days: BOX_OFFICE_DAYS, type }, fetchFn);
    return rows.map((r) => ({ title: r.Name, value: r.Plays ?? 0, posterPath: r.Id ? jellyfinPosterRef(r.Id) : undefined }));
  });
}

export async function getMostPopularByType(
  cfg: JellystatConfig,
  type: 'Movie' | 'Series',
  fetchFn: typeof fetch = fetch
): Promise<GlobalStat[]> {
  return withTtlCache(`jellystat-popular:${cfg.url}:${type}`, DEFAULT_CACHE_TTL_MS, async () => {
    const rows = await jsPost<RawTopItem[]>(cfg, '/stats/getMostPopularByType', { days: BOX_OFFICE_DAYS, type }, fetchFn);
    return rows.map((r) => ({ title: r.Name, value: r.unique_viewers ?? 0, posterPath: r.Id ? jellyfinPosterRef(r.Id) : undefined }));
  });
}

export async function getMostViewedLibraries(cfg: JellystatConfig, fetchFn: typeof fetch = fetch): Promise<GlobalStat[]> {
  return withTtlCache(`jellystat-libraries:${cfg.url}`, DEFAULT_CACHE_TTL_MS, async () => {
    const rows = await jsPost<RawTopItem[]>(cfg, '/stats/getMostViewedLibraries', { days: BOX_OFFICE_DAYS }, fetchFn);
    return rows.map((r) => ({ title: r.Name, value: r.Plays ?? 0 }));
  });
}

export async function getMostActiveUsers(cfg: JellystatConfig, fetchFn: typeof fetch = fetch): Promise<GlobalStat[]> {
  return withTtlCache(`jellystat-active-users:${cfg.url}`, DEFAULT_CACHE_TTL_MS, async () => {
    const rows = await jsPost<RawTopItem[]>(cfg, '/stats/getMostActiveUsers', { days: BOX_OFFICE_DAYS }, fetchFn);
    return rows.map((r) => ({ title: r.Name, value: r.Plays ?? 0 }));
  });
}

// GET /proxy/getSessions live-proxies to Jellyfin's own /Sessions and returns
// the identical raw JSON (verified 2026-09-22) — the caller (jellystat-source.ts)
// reuses media/jellyfin.ts's normalizeJellyfinSessions on this, rather than this
// module re-implementing that mapping.
export async function getJellystatSessionsRaw(cfg: JellystatConfig, fetchFn: typeof fetch = fetch): Promise<unknown[]> {
  return jsGet<unknown[]>(cfg, '/proxy/getSessions', fetchFn);
}
