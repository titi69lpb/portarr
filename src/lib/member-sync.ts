import type Database from 'better-sqlite3';
import type { MediaMember } from './media/types';

export interface SyncResult {
  added: number;
  updated: number;
  skippedNoEmail: number;
  total: number;
}

// Upserts every provider member into the same `users` table portal logins
// populate, so the existing mailing targeting (broadcast, individual
// selection, activeSince/neverActive groups) immediately covers the whole
// community — not just whoever has already logged into the portal.
// A never-logged-in user gets last_login = '' (the column is NOT NULL);
// every existing consumer of last_login (AdminMembersList's formatDate,
// getMemberOverview) already treats a falsy value as "no login yet", so
// this needs no changes elsewhere. Sync never overwrites a real last_login.
export function syncMembers(db: Database.Database, members: MediaMember[]): SyncResult {
  const withEmail = members.filter((m) => m.email);
  const skippedNoEmail = members.length - withEmail.length;

  const existing = new Set(
    (db.prepare('SELECT provider, external_id FROM users').all() as { provider: string; external_id: string }[]).map(
      (r) => `${r.provider}:${r.external_id}`
    )
  );

  const upsert = db.prepare(
    `INSERT INTO users (provider, external_id, email, username, last_login) VALUES (?, ?, ?, ?, '')
     ON CONFLICT(provider, external_id) DO UPDATE SET email = excluded.email, username = excluded.username`
  );

  let added = 0;
  let updated = 0;
  for (const m of withEmail) {
    upsert.run(m.provider, m.userId, m.email, m.username);
    if (existing.has(`${m.provider}:${m.userId}`)) {
      updated += 1;
    } else {
      added += 1;
    }
  }

  return { added, updated, skippedNoEmail, total: withEmail.length };
}
