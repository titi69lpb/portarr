import type Database from 'better-sqlite3';
import { getUserActivity } from './tautulli';
import { isSubscribed } from './newsletter-subscriptions';

export interface MemberOverview {
  plexId: string;
  username: string;
  email: string;
  portalLastLogin: string;
  tautulliLastSeen: string | null;
  newsletterOptedIn: boolean;
}

interface UserRow {
  plex_id: string;
  username: string;
  email: string;
  last_login: string;
}

export interface PortalUser {
  plexId: string;
  username: string;
  email: string;
  lastLogin: string;
}

// Plain DB read, no Tautulli round-trip — for callers that only need the
// email/username pairs (e.g. the mailing target picker), not the full
// activity-cross-referenced overview. getMemberOverview below builds on this
// rather than duplicating the query.
export function listUsers(db: Database.Database): PortalUser[] {
  const users = db
    .prepare('SELECT plex_id, username, email, last_login FROM users ORDER BY last_login DESC')
    .all() as UserRow[];
  return users.map((u) => ({ plexId: u.plex_id, username: u.username, email: u.email, lastLogin: u.last_login }));
}

export async function getMemberOverview(
  db: Database.Database,
  tautulliUrl: string,
  tautulliApiKey: string
): Promise<MemberOverview[]> {
  const users = listUsers(db);

  let activityByEmail = new Map<string, Date | null>();
  try {
    const activity = await getUserActivity(tautulliUrl, tautulliApiKey);
    activityByEmail = new Map(activity.map((a) => [a.email, a.lastSeenAt]));
  } catch (err) {
    console.error('Failed to fetch Tautulli activity for member overview:', err);
  }

  return users.map((u) => {
    const lastSeen = activityByEmail.get(u.email.toLowerCase()) ?? null;
    return {
      plexId: u.plexId,
      username: u.username,
      email: u.email,
      portalLastLogin: u.lastLogin,
      tautulliLastSeen: lastSeen ? lastSeen.toISOString() : null,
      newsletterOptedIn: isSubscribed(db, u.plexId),
    };
  });
}
