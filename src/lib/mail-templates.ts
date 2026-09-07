import type Database from 'better-sqlite3';

export interface MailTemplate {
  id: number;
  name: string;
  subject: string;
  bodyMarkdown: string;
  type: string;
  createdAt: string;
  updatedAt: string;
}

interface MailTemplateRow {
  id: number;
  name: string;
  subject: string;
  body_markdown: string;
  type: string;
  created_at: string;
  updated_at: string;
}

function toMailTemplate(row: MailTemplateRow): MailTemplate {
  return {
    id: row.id,
    name: row.name,
    subject: row.subject,
    bodyMarkdown: row.body_markdown,
    type: row.type,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listMailTemplates(db: Database.Database): MailTemplate[] {
  const rows = db
    .prepare('SELECT * FROM mail_templates ORDER BY id DESC')
    .all() as MailTemplateRow[];
  return rows.map(toMailTemplate);
}

export function getMailTemplate(db: Database.Database, id: number): MailTemplate | null {
  const row = db.prepare('SELECT * FROM mail_templates WHERE id = ?').get(id) as
    | MailTemplateRow
    | undefined;
  return row ? toMailTemplate(row) : null;
}

export function createMailTemplate(
  db: Database.Database,
  name: string,
  subject: string,
  bodyMarkdown: string
): MailTemplate {
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO mail_templates (name, subject, body_markdown, type, created_at, updated_at)
       VALUES (?, ?, ?, 'manual', ?, ?)`
    )
    .run(name, subject, bodyMarkdown, now, now);
  return toMailTemplate(
    db.prepare('SELECT * FROM mail_templates WHERE id = ?').get(info.lastInsertRowid) as MailTemplateRow
  );
}

export function updateMailTemplate(
  db: Database.Database,
  id: number,
  fields: { name?: string; subject?: string; bodyMarkdown?: string }
): MailTemplate | null {
  const existing = getMailTemplate(db, id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const name = fields.name ?? existing.name;
  const subject = fields.subject ?? existing.subject;
  const bodyMarkdown = fields.bodyMarkdown ?? existing.bodyMarkdown;

  db.prepare(
    'UPDATE mail_templates SET name = ?, subject = ?, body_markdown = ?, updated_at = ? WHERE id = ?'
  ).run(name, subject, bodyMarkdown, now, id);

  return getMailTemplate(db, id);
}

export function deleteMailTemplate(db: Database.Database, id: number): boolean {
  const info = db.prepare('DELETE FROM mail_templates WHERE id = ?').run(id);
  return info.changes > 0;
}
