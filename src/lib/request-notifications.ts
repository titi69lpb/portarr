import type Database from 'better-sqlite3';

export function hasBeenNotified(db: Database.Database, requestId: number): boolean {
  const row = db
    .prepare('SELECT 1 FROM notified_availability WHERE request_id = ?')
    .get(requestId);
  return row !== undefined;
}

export function markNotified(db: Database.Database, requestId: number): void {
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO notified_availability (request_id, notified_at) VALUES (?, ?) ON CONFLICT(request_id) DO NOTHING'
  ).run(requestId, now);
}
