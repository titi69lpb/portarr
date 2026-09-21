import { timeoutSignal } from '../fetch-timeout';
import type { MediaMember } from './types';

export interface SeerrUser {
  id: number;
  email: string;
  username: string | null;
  displayName: string | null;
  plexUsername: string | null;
  jellyfinUsername: string | null;
  jellyfinUserId: string | null;
}

interface RawSeerrUser {
  id: number;
  email?: string | null;
  username?: string | null;
  displayName?: string | null;
  plexUsername?: string | null;
  jellyfinUsername?: string | null;
  jellyfinUserId?: string | null;
}

const PAGE_SIZE = 100;
// Safety bound: 5000 users. A real install has a few dozen.
const MAX_PAGES = 50;

// Seerr / Overseerr `GET /api/v1/user` (X-Api-Key), paginated with take/skip;
// the response is { pageInfo: { pages, ... }, results: [...] }.
export async function fetchSeerrUsers(
  url: string,
  apiKey: string,
  fetchFn: typeof fetch = fetch
): Promise<SeerrUser[]> {
  const users: SeerrUser[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetchFn(`${url}/api/v1/user?take=${PAGE_SIZE}&skip=${page * PAGE_SIZE}`, {
      headers: { 'X-Api-Key': apiKey, Accept: 'application/json' },
      signal: timeoutSignal(),
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`Seerr API request failed: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as { pageInfo?: { pages?: number }; results?: RawSeerrUser[] };
    for (const u of data.results ?? []) {
      users.push({
        id: u.id,
        email: u.email ?? '',
        username: u.username ?? null,
        displayName: u.displayName ?? null,
        plexUsername: u.plexUsername ?? null,
        jellyfinUsername: u.jellyfinUsername ?? null,
        jellyfinUserId: u.jellyfinUserId ?? null,
      });
    }
    if (page + 1 >= (data.pageInfo?.pages ?? 1)) break;
  }
  return users;
}

const normalizeId = (id: string) => id.toLowerCase().replace(/-/g, '');
const normalizeName = (name: string) => name.trim().toLowerCase();

function findEmail(member: MediaMember, users: SeerrUser[]): string | null {
  const wantedId = normalizeId(member.userId);
  const byId = users.filter((u) => u.email && u.jellyfinUserId && normalizeId(u.jellyfinUserId) === wantedId);
  if (byId.length === 1) return byId[0].email;
  if (byId.length > 1) return null;

  // Fallback by name. It crosses identity spaces on purpose (the Seerr users
  // of a Plex-mode install are Plex accounts, with no Jellyfin id), so it only
  // fires on exactly one distinct Seerr user, never on an ambiguous name.
  const wantedName = normalizeName(member.username);
  if (!wantedName) return null;
  const byName = users.filter(
    (u) =>
      u.email &&
      [u.jellyfinUsername, u.username, u.displayName, u.plexUsername].some((v) => v && normalizeName(v) === wantedName)
  );
  const distinct = new Set(byName.map((u) => u.id));
  return distinct.size === 1 ? byName[0].email : null;
}

// Jellyfin users have no email. Fills the empty ones from Seerr users; never
// overwrites an existing email and never touches other providers' members.
export function enrichMembersWithEmail(members: MediaMember[], seerrUsers: SeerrUser[]): MediaMember[] {
  return members.map((member) => {
    if (member.provider !== 'jellyfin' || member.email) return member;
    const email = findEmail(member, seerrUsers);
    return email ? { ...member, email } : member;
  });
}
