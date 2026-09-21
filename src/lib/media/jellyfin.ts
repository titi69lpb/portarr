import { timeoutSignal } from '../fetch-timeout';
import type { PosterResult } from './types';

// Structural on purpose: this module is reachable from the Edge middleware
// (through media/membership.ts) and must never import config.ts.
export interface JellyfinProviderConfig {
  url: string;
  apiKey: string;
}

export interface JellyfinUser {
  id: string;
  name: string;
  isAdministrator: boolean;
  isDisabled: boolean;
}

export interface JellyfinItem {
  id: string;
  name: string;
  type: string;
  serverId: string | null;
  dateCreated: string | null;
  productionYear: number | null;
  seriesName: string | null;
  seriesId: string | null;
  seasonId: string | null;
  hasPrimaryImage: boolean;
  parentPrimaryImageItemId: string | null;
  hasSeriesPrimaryImage: boolean;
}

export type JellyfinAuthResult =
  | { status: 'denied' }
  | { status: 'ok'; user: JellyfinUser; accessToken: string };

interface RawUser {
  Id: string;
  Name?: string;
  Policy?: { IsAdministrator?: boolean; IsDisabled?: boolean };
}

interface RawItem {
  Id: string;
  Name?: string;
  Type?: string;
  ServerId?: string;
  DateCreated?: string;
  ProductionYear?: number;
  SeriesName?: string;
  SeriesId?: string;
  SeasonId?: string;
  ImageTags?: Record<string, string>;
  ParentPrimaryImageItemId?: string;
  SeriesPrimaryImageTag?: string;
}

// Verified against Jellyfin 12.1.0: every call must carry this Authorization
// header. The legacy X-Emby-Token / X-MediaBrowser-Token headers and ?api_key=
// are rejected with 401, so they must not be used.
const CLIENT_INFO = 'Client="Portarr", Device="Portarr", DeviceId="portarr", Version="1"';

/** Header for calls made on behalf of no token yet (AuthenticateByName). */
export function jellyfinClientAuth(): string {
  return `MediaBrowser ${CLIENT_INFO}`;
}

/** Header for API-key calls, and for calls made with a user's access token. */
export function jellyfinTokenAuth(token: string): string {
  // Quotes and line breaks would break out of the header value.
  return `MediaBrowser ${CLIENT_INFO}, Token="${token.replace(/["\r\n]/g, '')}"`;
}

function normalizeUser(raw: RawUser): JellyfinUser {
  return {
    id: raw.Id,
    name: raw.Name ?? '',
    isAdministrator: raw.Policy?.IsAdministrator === true,
    isDisabled: raw.Policy?.IsDisabled === true,
  };
}

function normalizeItem(raw: RawItem): JellyfinItem {
  return {
    id: raw.Id,
    name: raw.Name ?? '',
    type: raw.Type ?? '',
    serverId: raw.ServerId ?? null,
    dateCreated: raw.DateCreated ?? null,
    productionYear: raw.ProductionYear ?? null,
    seriesName: raw.SeriesName ?? null,
    seriesId: raw.SeriesId ?? null,
    seasonId: raw.SeasonId ?? null,
    hasPrimaryImage: Boolean(raw.ImageTags?.Primary),
    parentPrimaryImageItemId: raw.ParentPrimaryImageItemId ?? null,
    hasSeriesPrimaryImage: Boolean(raw.SeriesPrimaryImageTag),
  };
}

async function jfGet<T>(cfg: JellyfinProviderConfig, path: string, fetchFn: typeof fetch): Promise<T> {
  const res = await fetchFn(`${cfg.url}${path}`, {
    headers: { Authorization: jellyfinTokenAuth(cfg.apiKey), Accept: 'application/json' },
    signal: timeoutSignal(),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Jellyfin API request failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export async function listUsers(cfg: JellyfinProviderConfig, fetchFn: typeof fetch = fetch): Promise<JellyfinUser[]> {
  const raw = await jfGet<RawUser[]>(cfg, '/Users', fetchFn);
  return raw.map(normalizeUser);
}

// The password only ever appears in this request body. Errors carry the HTTP
// status and nothing from the request or the response body.
export async function authenticateByName(
  cfg: JellyfinProviderConfig,
  username: string,
  password: string,
  fetchFn: typeof fetch = fetch
): Promise<JellyfinAuthResult> {
  const res = await fetchFn(`${cfg.url}/Users/AuthenticateByName`, {
    method: 'POST',
    headers: {
      Authorization: jellyfinClientAuth(),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ Username: username, Pw: password }),
    signal: timeoutSignal(),
    cache: 'no-store',
  });
  // Jellyfin answers a wrong password with 401 and (unverified) a disabled/blocked account with 403: both
  // must look the same to the caller so the account state is not an oracle.
  if (res.status === 401 || res.status === 403) {
    return { status: 'denied' };
  }
  if (!res.ok) {
    throw new Error(`Jellyfin authentication request failed: ${res.status}`);
  }
  const data = (await res.json()) as { User?: RawUser; AccessToken?: string };
  if (!data.User?.Id || !data.AccessToken) {
    throw new Error('Jellyfin authentication response was missing the user or the access token');
  }
  return { status: 'ok', user: normalizeUser(data.User), accessToken: data.AccessToken };
}

// Ends the session created by AuthenticateByName so Portarr leaves none behind.
export async function logoutSession(
  cfg: JellyfinProviderConfig,
  accessToken: string,
  fetchFn: typeof fetch = fetch
): Promise<void> {
  const res = await fetchFn(`${cfg.url}/Sessions/Logout`, {
    method: 'POST',
    headers: { Authorization: jellyfinTokenAuth(accessToken) },
    signal: timeoutSignal(),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Jellyfin session logout failed: ${res.status}`);
  }
}

export async function getRecentItems(
  cfg: JellyfinProviderConfig,
  type: 'Movie' | 'Episode',
  limit: number,
  fetchFn: typeof fetch = fetch
): Promise<JellyfinItem[]> {
  const data = await jfGet<{ Items?: RawItem[] }>(
    cfg,
    `/Items?includeItemTypes=${type}&recursive=true&sortBy=DateCreated&sortOrder=Descending&limit=${limit}&fields=DateCreated`,
    fetchFn
  );
  return (data.Items ?? []).map(normalizeItem);
}

export async function searchItems(
  cfg: JellyfinProviderConfig,
  query: string,
  limit: number,
  fetchFn: typeof fetch = fetch
): Promise<JellyfinItem[]> {
  const data = await jfGet<{ Items?: RawItem[] }>(
    cfg,
    `/Items?searchTerm=${encodeURIComponent(query)}&includeItemTypes=Movie,Series&recursive=true&limit=${limit}&fields=ProductionYear`,
    fetchFn
  );
  return (data.Items ?? []).map(normalizeItem);
}

// Item ids are 32 hex chars (36 with dashes); anything else never reaches the
// network, so a crafted poster ref cannot steer the request path.
const JELLYFIN_ID = /^[0-9a-fA-F-]{32,36}$/;
const POSTER_PREFIX = 'jellyfin:';

export function jellyfinPosterRef(itemId: string): string {
  return `${POSTER_PREFIX}${itemId}`;
}

export function parseJellyfinPosterRef(ref: string): string | null {
  if (!ref.startsWith(POSTER_PREFIX)) return null;
  const id = ref.slice(POSTER_PREFIX.length);
  return JELLYFIN_ID.test(id) ? id : null;
}

export async function fetchJellyfinPoster(
  cfg: JellyfinProviderConfig,
  itemId: string,
  fetchFn: typeof fetch = fetch
): Promise<PosterResult | null> {
  if (!JELLYFIN_ID.test(itemId)) return null;
  const res = await fetchFn(`${cfg.url}/Items/${itemId}/Images/Primary?maxWidth=300&maxHeight=450&quality=90`, {
    headers: { Authorization: jellyfinTokenAuth(cfg.apiKey) },
    signal: timeoutSignal(),
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return { bytes: await res.arrayBuffer(), contentType: res.headers.get('content-type') ?? 'image/jpeg' };
}

// Deep link into the Jellyfin web client (route format confirmed in the served
// bundle: `#/details?id=`).
export function jellyfinWebUrl(baseUrl: string, itemId: string, serverId: string | null): string {
  const server = serverId ? `&serverId=${serverId}` : '';
  return `${baseUrl}/web/index.html#/details?id=${itemId}${server}`;
}
