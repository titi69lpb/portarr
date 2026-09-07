import { timeoutSignal } from './fetch-timeout';

export interface PendingRequest {
  title: string;
  type: 'movie' | 'tv';
  posterPath: string | null;
  requestedByUsername: string;
  requestedAt: string;
}

interface OverseerrRequest {
  id: number;
  status: number;
  type: 'movie' | 'tv';
  createdAt: string;
  media: { tmdbId: number; status: number };
  requestedBy: { username: string; displayName: string; email?: string };
}

export interface AvailableRequest {
  requestId: number;
  title: string;
  type: 'movie' | 'tv';
  requesterEmail: string | null;
  requesterUsername: string;
}

interface TitleDetail {
  title: string;
  posterPath: string | null;
}

// A given tmdbId's title/poster never change, so once resolved they're cached
// for the life of the process — this is what turns "up to 10 detail calls per
// dashboard load" into "up to 10 calls ever, per title anyone has requested".
const titleCache = new Map<string, TitleDetail>();

export function resetOverseerrCacheForTests(): void {
  titleCache.clear();
}

async function resolveTitleDetail(
  overseerrUrl: string,
  apiKey: string,
  type: 'movie' | 'tv',
  tmdbId: number,
  fetchFn: typeof fetch
): Promise<TitleDetail> {
  const cacheKey = `${type}:${tmdbId}`;
  const cached = titleCache.get(cacheKey);
  if (cached) return cached;

  const detailRes = await fetchFn(`${overseerrUrl}/api/v1/${type}/${tmdbId}`, {
    headers: { 'X-Api-Key': apiKey },
    signal: timeoutSignal(),
  cache: 'no-store',
  });
  if (!detailRes.ok) throw new Error('detail lookup failed');
  const detail = (await detailRes.json()) as { title?: string; name?: string; posterPath?: string };
  const resolved: TitleDetail = {
    title: detail.title ?? detail.name ?? 'Média inconnu',
    posterPath: detail.posterPath ?? null,
  };
  titleCache.set(cacheKey, resolved);
  return resolved;
}

export async function getPendingRequests(
  overseerrUrl: string,
  apiKey: string,
  fetchFn: typeof fetch = fetch
): Promise<PendingRequest[]> {
  // take was capped at 10 to bound the per-item title-detail fan-out below —
  // but that was before resolveTitleDetail gained a persistent cache (see
  // getAvailableRequests), which now makes repeat lookups free. Raised back
  // up after this portal's real backlog (47 pending requests) turned out to
  // silently truncate at 10 with no indication anything was missing.
  const res = await fetchFn(`${overseerrUrl}/api/v1/request?filter=approved&take=50`, {
    headers: { 'X-Api-Key': apiKey },
    signal: timeoutSignal(),
  cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Overseerr API request failed: ${res.status}`);
  }
  const data = (await res.json()) as { results: OverseerrRequest[] };
  const approved = data.results.filter((r) => r.status === 2 && r.media.status !== 5);

  const withTitles = await Promise.allSettled(
    approved.map(async (r) => {
      const detail = await resolveTitleDetail(overseerrUrl, apiKey, r.type, r.media.tmdbId, fetchFn);
      return {
        title: detail.title,
        type: r.type,
        posterPath: detail.posterPath,
        requestedByUsername: r.requestedBy.displayName || r.requestedBy.username,
        requestedAt: r.createdAt,
      };
    })
  );

  return withTitles.map((result, i) =>
    result.status === 'fulfilled'
      ? result.value
      : {
          title: 'Média inconnu',
          type: approved[i].type,
          posterPath: null,
          requestedByUsername: approved[i].requestedBy.displayName || approved[i].requestedBy.username,
          requestedAt: approved[i].createdAt,
        }
  );
}

// Requests whose media just became available (Overseerr status 5) — the raw
// material for an "your request is ready" notification. Deliberately skips
// (rather than placeholder-fills) any request whose title lookup fails: the
// caller tracks which requestIds it has already notified, so an item that
// fails here is simply retried on the next run instead of emailing a
// "Média inconnu" subject line.
export async function getAvailableRequests(
  overseerrUrl: string,
  apiKey: string,
  fetchFn: typeof fetch = fetch
): Promise<AvailableRequest[]> {
  const res = await fetchFn(`${overseerrUrl}/api/v1/request?filter=available&take=50`, {
    headers: { 'X-Api-Key': apiKey },
    signal: timeoutSignal(),
  cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Overseerr API request failed: ${res.status}`);
  }
  const data = (await res.json()) as { results: OverseerrRequest[] };
  // Confirmed live against production Overseerr: once media becomes available,
  // the top-level request.status also flips to 5 (mirroring media.status),
  // it does NOT stay at 2 ("approved") the way it does for pending-but-not-yet-
  // available requests. Filtering on request.status === 2 here silently
  // excluded every available request. media.status === 5 alone is what the
  // filter=available query param already means server-side; this check is
  // just defense in depth against a malformed row.
  const available = data.results.filter((r) => r.media.status === 5);

  const withTitles = await Promise.allSettled(
    available.map(async (r): Promise<AvailableRequest> => {
      const detail = await resolveTitleDetail(overseerrUrl, apiKey, r.type, r.media.tmdbId, fetchFn);
      return {
        requestId: r.id,
        title: detail.title,
        type: r.type,
        requesterEmail: r.requestedBy.email ?? null,
        requesterUsername: r.requestedBy.displayName || r.requestedBy.username,
      };
    })
  );

  return withTitles
    .filter((result): result is PromiseFulfilledResult<AvailableRequest> => result.status === 'fulfilled')
    .map((result) => result.value);
}
