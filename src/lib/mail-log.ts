import type Database from 'better-sqlite3';

export interface MailLogEntry {
  id: number;
  templateId: number | null;
  templateName: string;
  recipientEmail: string;
  recipientUsername: string | null;
  sentAt: string;
  status: 'sent' | 'failed' | 'test';
}

interface MailLogRow {
  id: number;
  template_id: number | null;
  template_name: string;
  recipient_email: string;
  recipient_username: string | null;
  sent_at: string;
  status: string;
}

function toMailLogEntry(row: MailLogRow): MailLogEntry {
  return {
    id: row.id,
    templateId: row.template_id,
    templateName: row.template_name,
    recipientEmail: row.recipient_email,
    recipientUsername: row.recipient_username,
    sentAt: row.sent_at,
    status: row.status as MailLogEntry['status'],
  };
}

export function insertMailLog(
  db: Database.Database,
  entry: {
    templateId: number | null;
    templateName: string;
    recipientEmail: string;
    recipientUsername: string | null;
    status: 'sent' | 'failed' | 'test';
  }
): MailLogEntry {
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO mail_log (template_id, template_name, recipient_email, recipient_username, sent_at, status)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      entry.templateId,
      entry.templateName,
      entry.recipientEmail,
      entry.recipientUsername,
      now,
      entry.status
    );
  return toMailLogEntry(
    db.prepare('SELECT * FROM mail_log WHERE id = ?').get(info.lastInsertRowid) as MailLogRow
  );
}

export function listMailLog(db: Database.Database): MailLogEntry[] {
  const rows = db
    .prepare('SELECT * FROM mail_log ORDER BY id DESC LIMIT 200')
    .all() as MailLogRow[];
  return rows.map(toMailLogEntry);
}
