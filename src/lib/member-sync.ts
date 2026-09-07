import type Database from 'better-sqlite3';
import type { PlexSharedUser } from './plex';

export interface SyncResult {
  added: number;
  updated: number;
  skippedNoEmail: number;
  total: number;
}

// Upserts every Plex-shared user into the same `users` table portal logins
// populate, so the existing mailing targeting (broadcast, individual
// selection, activeSince/neverActive groups) immediately covers the whole
// Plex community — not just whoever has already logged into the new portal.
// A never-logged-in user gets last_login = '' (the column is NOT NULL);
// every existing consumer of last_login (AdminMembersList's formatDate,
// getMemberOverview) already treats a falsy value as "no login yet", so
// this needs no changes elsewhere. Sync never overwrites a real last_login.
export function syncPlexUsers(db: Database.Database, plexUsers: PlexSharedUser[]): SyncResult {
  const withEmail = plexUsers.filter((u) => u.email);
  const skippedNoEmail = plexUsers.length - withEmail.length;

  const existingIds = new Set(
    (db.prepare('SELECT plex_id FROM users').all() as { plex_id: string }[]).map((r) => r.plex_id)
  );

  const upsert = db.prepare(
    `INSERT INTO users (plex_id, email, username, last_login) VALUES (?, ?, ?, '')
     ON CONFLICT(plex_id) DO UPDATE SET email = excluded.email, username = excluded.username`
  );

  let added = 0;
  let updated = 0;
  for (const u of withEmail) {
    upsert.run(u.plexId, u.email, u.username);
    if (existingIds.has(u.plexId)) {
      updated += 1;
    } else {
      added += 1;
    }
  }

  return { added, updated, skippedNoEmail, total: withEmail.length };
}
