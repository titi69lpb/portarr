import Database from 'better-sqlite3';
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';

let instance: Database.Database | null = null;
let instancePath: string | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  provider TEXT NOT NULL,
  external_id TEXT NOT NULL,
  email TEXT NOT NULL,
  username TEXT NOT NULL,
  last_login TEXT NOT NULL,
  locale TEXT,
  PRIMARY KEY (provider, external_id)
);

CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_markdown TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mail_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_markdown TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mail_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER,
  template_name TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  recipient_username TEXT,
  sent_at TEXT NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS newsletter_subscriptions (
  provider TEXT NOT NULL,
  external_id TEXT NOT NULL,
  opted_in INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (provider, external_id)
);

CREATE TABLE IF NOT EXISTS newsletter_archive (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject TEXT NOT NULL,
  html TEXT NOT NULL,
  sent_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notified_availability (
  request_id INTEGER PRIMARY KEY,
  notified_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

// Databases created before i18n have a `users` table without `locale`;
// CREATE TABLE IF NOT EXISTS will not add it, so ALTER in place (idempotent).
function migrateUsersLocaleColumn(db: Database.Database): void {
  const columns = db.prepare('PRAGMA table_info(users)').all() as { name: string }[];
  if (!columns.some((c) => c.name === 'locale')) {
    db.exec('ALTER TABLE users ADD COLUMN locale TEXT');
  }
}

export const LEGACY_BACKUP_SUFFIX = '.pre-provider-migration';

function tableHasColumn(db: Database.Database, table: string, column: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return columns.some((c) => c.name === column);
}

// SQLite cannot alter a primary key, so moving `users` and
// `newsletter_subscriptions` from `plex_id` to (provider, external_id) means
// rename -> create new -> copy -> drop, inside one transaction. Guarded by
// the presence of the legacy `plex_id` column, so it is a no-op on fresh and
// already-migrated databases. An older Portarr image cannot read the new
// schema, so a copy of the database is taken first (once) as the rollback.
function migrateToProviderKeys(db: Database.Database, dbPath: string): void {
  const usersLegacy = tableHasColumn(db, 'users', 'plex_id');
  const subsLegacy = tableHasColumn(db, 'newsletter_subscriptions', 'plex_id');
  if (!usersLegacy && !subsLegacy) return;

  if (dbPath !== ':memory:') {
    const backupPath = `${dbPath}${LEGACY_BACKUP_SUFFIX}`;
    if (!existsSync(backupPath)) {
      // Write to a temp file and rename into place: rename is atomic on one
      // filesystem, so the final path either does not exist or is a complete
      // backup, never the half-written file a crash or full disk would leave.
      // VACUUM INTO refuses an existing target, so clear a stale temp first.
      // It writes a consistent copy even in WAL mode and cannot run inside a
      // transaction, hence before db.transaction() below.
      const tmpPath = `${backupPath}.tmp`;
      try {
        rmSync(tmpPath, { force: true });
        db.exec(`VACUUM INTO '${tmpPath.replace(/'/g, "''")}'`);
        renameSync(tmpPath, backupPath);
      } catch (err) {
        try {
          rmSync(tmpPath, { force: true });
        } catch {
          // best effort: the original failure is the one worth reporting
        }
        const reason = err instanceof Error ? err.message : String(err);
        // Aborting is deliberate: the database stays fully legacy (readable
        // by the previous image) rather than migrating without a rollback.
        throw new Error(
          `Portarr refused to migrate the database: could not write the pre-migration backup ${backupPath} (${reason}). ` +
            'The database was left unchanged; free disk space or fix write access to its directory and restart.'
        );
      }
    }
  }

  db.transaction(() => {
    if (usersLegacy) db.exec('ALTER TABLE users RENAME TO users_legacy');
    if (subsLegacy) db.exec('ALTER TABLE newsletter_subscriptions RENAME TO newsletter_subscriptions_legacy');
    db.exec(SCHEMA);
    if (usersLegacy) {
      db.exec(
        `INSERT INTO users (provider, external_id, email, username, last_login)
         SELECT 'plex', plex_id, email, username, last_login FROM users_legacy`
      );
      db.exec('DROP TABLE users_legacy');
    }
    if (subsLegacy) {
      db.exec(
        `INSERT INTO newsletter_subscriptions (provider, external_id, opted_in, updated_at)
         SELECT 'plex', plex_id, opted_in, updated_at FROM newsletter_subscriptions_legacy`
      );
      db.exec('DROP TABLE newsletter_subscriptions_legacy');
    }
  })();
}

export function getDb(dbPath?: string): Database.Database {
  // If no explicit path and we have an instance, return it
  if (dbPath === undefined && instance) {
    return instance;
  }

  const resolvedPath = dbPath ?? process.env.DATABASE_PATH ?? './data/portal.db';

  if (instance && instancePath === resolvedPath) {
    return instance;
  }

  if (instance) {
    instance.close();
  }

  // Create parent directory if needed (skip for :memory: paths)
  if (resolvedPath !== ':memory:') {
    mkdirSync(dirname(resolvedPath), { recursive: true });
  }

  instance = new Database(resolvedPath);
  instance.pragma('journal_mode = WAL');
  try {
    migrateToProviderKeys(instance, resolvedPath);
  } catch (err) {
    // Do not leave a half-initialised (still legacy) handle for the next
    // getDb() call to hand out.
    instance.close();
    instance = null;
    throw err;
  }
  instance.exec(SCHEMA);
  migrateUsersLocaleColumn(instance);
  instancePath = resolvedPath;
  return instance;
}

export function resetDbForTests(): void {
  if (instance) {
    instance.close();
  }
  instance = null;
  instancePath = null;
}
