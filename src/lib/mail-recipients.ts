import type Database from 'better-sqlite3';
import { listUsers } from './members';
import { getActivitySourceFor } from './activity/registry';
import type { ActivitySource } from './activity/types';

export interface Recipient {
  email: string;
  username: string;
}

export type RecipientParams =
  | { mode: 'broadcast' }
  | { mode: 'individual'; emails: string[] }
  | { mode: 'group'; filter: { type: 'activeSince'; days: number } | { type: 'neverActive' } };

// One person can be a Plex and a Jellyfin member sharing an address: mail it once (first wins).
export function dedupeRecipientsByEmail<T extends { email: string }>(recipients: T[]): T[] {
  const seen = new Set<string>();
  return recipients.filter((r) => {
    const key = r.email.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function resolveRecipients(
  db: Database.Database,
  params: RecipientParams,
  sources: ActivitySource[]
): Promise<Recipient[]> {
  return dedupeRecipientsByEmail(await selectRecipients(db, params, sources));
}

async function selectRecipients(
  db: Database.Database,
  params: RecipientParams,
  sources: ActivitySource[]
): Promise<Recipient[]> {
  const allUsers = listUsers(db).filter((u) => u.email !== '');

  if (params.mode === 'broadcast') {
    return allUsers.map((u) => ({ email: u.email, username: u.username }));
  }

  if (params.mode === 'individual') {
    const wanted = new Set(params.emails.map((e) => e.toLowerCase()));
    return allUsers.filter((u) => wanted.has(u.email.toLowerCase())).map((u) => ({ email: u.email, username: u.username }));
  }

  // Group filter: resolve each member's last-seen activity through whichever
  // source matches their own provider — a member whose provider has no active
  // source (shouldn't happen once every configured provider has at least a
  // degraded activity source) is treated as never active, same as a real "no
  // record" result would be.
  const withLastSeen = await Promise.all(
    allUsers.map(async (u) => {
      const source = getActivitySourceFor(sources, u.provider);
      const lastSeenAt = source ? await source.lastSeen(u) : null;
      return { user: u, lastSeenAt };
    })
  );

  return withLastSeen
    .filter(({ lastSeenAt }) => {
      if (params.filter.type === 'neverActive') return lastSeenAt === null;
      if (lastSeenAt === null) return false;
      const cutoff = Date.now() - params.filter.days * 24 * 60 * 60 * 1000;
      return new Date(lastSeenAt).getTime() >= cutoff;
    })
    .map(({ user }) => ({ email: user.email, username: user.username }));
}
