import type Database from 'better-sqlite3';
import { getUserActivity } from './tautulli';

export interface Recipient {
  email: string;
  username: string;
}

export type RecipientParams =
  | { mode: 'broadcast' }
  | { mode: 'individual'; emails: string[] }
  | { mode: 'group'; filter: { type: 'activeSince'; days: number } | { type: 'neverActive' } };

export interface RecipientDeps {
  getUserActivity: typeof getUserActivity;
}

export const defaultRecipientDeps: RecipientDeps = { getUserActivity };

interface UserRow {
  email: string;
  username: string;
}

export async function resolveRecipients(
  db: Database.Database,
  params: RecipientParams,
  deps: RecipientDeps,
  tautulliCtx: { url: string; apiKey: string }
): Promise<Recipient[]> {
  const allUsers = db
    .prepare('SELECT email, username FROM users WHERE email != \'\'')
    .all() as UserRow[];

  if (params.mode === 'broadcast') {
    return allUsers;
  }

  if (params.mode === 'individual') {
    const wanted = new Set(params.emails.map((e) => e.toLowerCase()));
    return allUsers.filter((u) => wanted.has(u.email.toLowerCase()));
  }

  const activity = await deps.getUserActivity(tautulliCtx.url, tautulliCtx.apiKey);
  const lastSeenByEmail = new Map(activity.map((a) => [a.email.toLowerCase(), a.lastSeenAt]));

  return allUsers.filter((u) => {
    const lastSeenAt = lastSeenByEmail.get(u.email.toLowerCase()) ?? null;
    if (params.filter.type === 'neverActive') {
      return lastSeenAt === null;
    }
    if (lastSeenAt === null) return false;
    const cutoff = Date.now() - params.filter.days * 24 * 60 * 60 * 1000;
    return lastSeenAt.getTime() >= cutoff;
  });
}
