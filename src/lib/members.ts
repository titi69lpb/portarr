import type Database from 'better-sqlite3';
import type { ActivitySource } from './activity/types';
import { getActivitySourceFor } from './activity/registry';
import { isSubscribed } from './newsletter-subscriptions';
import type { ProviderId } from './media/types';

export interface MemberOverview {
  provider: ProviderId;
  userId: string;
  username: string;
  email: string;
  portalLastLogin: string;
  lastSeen: string | null;
  newsletterOptedIn: boolean;
}

interface UserRow {
  provider: ProviderId;
  external_id: string;
  username: string;
  email: string;
  last_login: string;
}

export interface PortalUser {
  provider: ProviderId;
  userId: string;
  username: string;
  email: string;
  lastLogin: string;
}

// Plain DB read, no activity-source round-trip — for callers that only need the
// email/username pairs (e.g. the mailing target picker), not the full
// activity-cross-referenced overview. getMemberOverview below builds on this
// rather than duplicating the query.
export function listUsers(db: Database.Database): PortalUser[] {
  const users = db
    .prepare('SELECT provider, external_id, username, email, last_login FROM users ORDER BY last_login DESC')
    .all() as UserRow[];
  return users.map((u) => ({
    provider: u.provider,
    userId: u.external_id,
    username: u.username,
    email: u.email,
    lastLogin: u.last_login,
  }));
}

export async function getMemberOverview(db: Database.Database, sources: ActivitySource[]): Promise<MemberOverview[]> {
  const users = listUsers(db);

  return Promise.all(
    users.map(async (u) => {
      const source = getActivitySourceFor(sources, u.provider);
      let lastSeen: string | null = null;
      if (source) {
        try {
          lastSeen = await source.lastSeen(u);
        } catch (err) {
          console.error(`Failed to fetch ${u.provider} activity for member overview:`, err);
        }
      }
      return {
        provider: u.provider,
        userId: u.userId,
        username: u.username,
        email: u.email,
        portalLastLogin: u.lastLogin,
        lastSeen,
        newsletterOptedIn: isSubscribed(db, { provider: u.provider, userId: u.userId }),
      };
    })
  );
}
