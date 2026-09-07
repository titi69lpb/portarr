import type Database from 'better-sqlite3';

export interface Announcement {
  id: number;
  contentMarkdown: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AnnouncementRow {
  id: number;
  content_markdown: string;
  active: number;
  created_at: string;
  updated_at: string;
}

function toAnnouncement(row: AnnouncementRow): Announcement {
  return {
    id: row.id,
    contentMarkdown: row.content_markdown,
    active: row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listAnnouncements(db: Database.Database): Announcement[] {
  const rows = db
    .prepare('SELECT * FROM announcements ORDER BY id DESC')
    .all() as AnnouncementRow[];
  return rows.map(toAnnouncement);
}

export function getActiveAnnouncement(db: Database.Database): Announcement | null {
  const row = db.prepare('SELECT * FROM announcements WHERE active = 1 LIMIT 1').get() as
    | AnnouncementRow
    | undefined;
  return row ? toAnnouncement(row) : null;
}

export function createAnnouncement(db: Database.Database, contentMarkdown: string): Announcement {
  const now = new Date().toISOString();
  const id = db.transaction(() => {
    db.prepare('UPDATE announcements SET active = 0, updated_at = ? WHERE active = 1').run(now);
    const info = db
      .prepare(
        'INSERT INTO announcements (content_markdown, active, created_at, updated_at) VALUES (?, 1, ?, ?)'
      )
      .run(contentMarkdown, now, now);
    return info.lastInsertRowid as number;
  })();
  return toAnnouncement(
    db.prepare('SELECT * FROM announcements WHERE id = ?').get(id) as AnnouncementRow
  );
}

export function updateAnnouncementContent(
  db: Database.Database,
  id: number,
  contentMarkdown: string
): Announcement | null {
  const now = new Date().toISOString();
  const info = db
    .prepare('UPDATE announcements SET content_markdown = ?, updated_at = ? WHERE id = ?')
    .run(contentMarkdown, now, id);
  if (info.changes === 0) return null;
  return toAnnouncement(
    db.prepare('SELECT * FROM announcements WHERE id = ?').get(id) as AnnouncementRow
  );
}

export function setAnnouncementActive(db: Database.Database, id: number): Announcement | null {
  const now = new Date().toISOString();
  return db.transaction(() => {
    const exists = db.prepare('SELECT id FROM announcements WHERE id = ?').get(id);
    if (!exists) return null;
    db.prepare('UPDATE announcements SET active = 0, updated_at = ? WHERE active = 1').run(now);
    db.prepare('UPDATE announcements SET active = 1, updated_at = ? WHERE id = ?').run(now, id);
    return toAnnouncement(
      db.prepare('SELECT * FROM announcements WHERE id = ?').get(id) as AnnouncementRow
    );
  })();
}

export function deactivateAnnouncement(db: Database.Database, id: number): Announcement | null {
  const now = new Date().toISOString();
  const info = db
    .prepare('UPDATE announcements SET active = 0, updated_at = ? WHERE id = ?')
    .run(now, id);
  if (info.changes === 0) return null;
  return toAnnouncement(
    db.prepare('SELECT * FROM announcements WHERE id = ?').get(id) as AnnouncementRow
  );
}

export function deleteAnnouncement(db: Database.Database, id: number): boolean {
  const info = db.prepare('DELETE FROM announcements WHERE id = ?').run(id);
  return info.changes > 0;
}
