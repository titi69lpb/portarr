import type Database from 'better-sqlite3';
import type { ProviderId } from './media/types';
import type { Locale } from './i18n/dictionaries';

// locale: null clears the personal override so the user falls back to the
// instance default again (see getLocale() in i18n/locale.ts).
export function setUserLocale(
  db: Database.Database,
  provider: ProviderId,
  externalId: string,
  locale: Locale | null
): void {
  db.prepare('UPDATE users SET locale = ? WHERE provider = ? AND external_id = ?').run(
    locale,
    provider,
    externalId
  );
}
