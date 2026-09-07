import type Database from 'better-sqlite3';

export interface NewsletterArchiveEntry {
  id: number;
  subject: string;
  html: string;
  sentAt: string;
}

interface NewsletterArchiveRow {
  id: number;
  subject: string;
  html: string;
  sent_at: string;
}

function toNewsletterArchiveEntry(row: NewsletterArchiveRow): NewsletterArchiveEntry {
  return {
    id: row.id,
    subject: row.subject,
    html: row.html,
    sentAt: row.sent_at,
  };
}

export function insertNewsletterArchive(
  db: Database.Database,
  entry: { subject: string; html: string }
): NewsletterArchiveEntry {
  const now = new Date().toISOString();
  const info = db
    .prepare('INSERT INTO newsletter_archive (subject, html, sent_at) VALUES (?, ?, ?)')
    .run(entry.subject, entry.html, now);
  return toNewsletterArchiveEntry(
    db.prepare('SELECT * FROM newsletter_archive WHERE id = ?').get(info.lastInsertRowid) as NewsletterArchiveRow
  );
}

export function getNewsletterArchive(db: Database.Database, id: number): NewsletterArchiveEntry | null {
  const row = db.prepare('SELECT * FROM newsletter_archive WHERE id = ?').get(id) as
    | NewsletterArchiveRow
    | undefined;
  return row ? toNewsletterArchiveEntry(row) : null;
}
