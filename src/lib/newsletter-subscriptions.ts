import type Database from 'better-sqlite3';
import type { MemberRef } from './media/types';

export function isSubscribed(db: Database.Database, ref: MemberRef): boolean {
  const row = db
    .prepare('SELECT opted_in FROM newsletter_subscriptions WHERE provider = ? AND external_id = ?')
    .get(ref.provider, ref.userId) as { opted_in: number } | undefined;
  return row ? row.opted_in === 1 : true;
}

export function setSubscribed(db: Database.Database, ref: MemberRef, subscribed: boolean): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO newsletter_subscriptions (provider, external_id, opted_in, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(provider, external_id) DO UPDATE SET opted_in = excluded.opted_in, updated_at = excluded.updated_at`
  ).run(ref.provider, ref.userId, subscribed ? 1 : 0, now);
}
