import type Database from 'better-sqlite3';

export function isSubscribed(db: Database.Database, plexId: string): boolean {
  const row = db
    .prepare('SELECT opted_in FROM newsletter_subscriptions WHERE plex_id = ?')
    .get(plexId) as { opted_in: number } | undefined;
  return row ? row.opted_in === 1 : true;
}

export function setSubscribed(db: Database.Database, plexId: string, subscribed: boolean): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO newsletter_subscriptions (plex_id, opted_in, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(plex_id) DO UPDATE SET opted_in = excluded.opted_in, updated_at = excluded.updated_at`
  ).run(plexId, subscribed ? 1 : 0, now);
}
