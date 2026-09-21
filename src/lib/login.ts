import { NextResponse } from 'next/server';
import type Database from 'better-sqlite3';
import { createSession, SESSION_COOKIE_NAME } from './session';
import { enrichMembersWithEmail, fetchSeerrUsers } from './media/seerr-emails';
import type { MediaMember } from './media/types';

// The one place a successful login turns into a `users` row and a session
// cookie, shared by every provider (Plex PIN poll, Jellyfin password).
export async function completeLogin(
  db: Database.Database,
  sessionSecret: string,
  user: MediaMember,
  isOwner: boolean
): Promise<NextResponse> {
  // Jellyfin members have no email of their own, so a login with an empty email
  // must not erase one already filled by the member sync or a Seerr lookup.
  db.prepare(
    `INSERT INTO users (provider, external_id, email, username, last_login) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(provider, external_id) DO UPDATE SET
       email = CASE WHEN excluded.email != '' THEN excluded.email ELSE users.email END,
       username = excluded.username,
       last_login = excluded.last_login`
  ).run(user.provider, user.userId, user.email, user.username, new Date().toISOString());

  const token = await createSession({ ...user, isOwner }, sessionSecret);
  const response = NextResponse.json({ status: 'ok' });
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}

// Email for a member whose provider has none: the one already stored, else a
// Seerr lookup. Never fails a login: any Seerr problem just leaves it empty.
export async function resolveLoginEmail(
  db: Database.Database,
  member: MediaMember,
  seerr: { url: string; apiKey: string } | null,
  fetchFn: typeof fetch = fetch
): Promise<MediaMember> {
  if (member.email) return member;

  const stored = db
    .prepare('SELECT email FROM users WHERE provider = ? AND external_id = ?')
    .get(member.provider, member.userId) as { email: string } | undefined;
  if (stored?.email) return { ...member, email: stored.email };

  if (!seerr) return member;
  try {
    const users = await fetchSeerrUsers(seerr.url, seerr.apiKey, fetchFn);
    return enrichMembersWithEmail([member], users)[0];
  } catch (err) {
    console.error('Failed to look up the member email in Seerr:', err instanceof Error ? err.message : 'unknown error');
    return member;
  }
}
