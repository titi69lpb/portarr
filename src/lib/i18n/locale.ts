import type Database from 'better-sqlite3';
import type { SessionUser } from '../session';
import { getSetting } from '../settings';
import { type Locale, DEFAULT_LOCALE, isLocale } from './dictionaries';

export function pickBrowserLocale(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const first = acceptLanguage.split(',')[0]?.split(';')[0]?.trim().toLowerCase() ?? '';
  return first.startsWith('fr') ? 'fr' : 'en';
}

export function getUserPersonalLocale(sessionUser: SessionUser | null, db: Database.Database): Locale | null {
  if (!sessionUser) return null;
  const row = db
    .prepare('SELECT locale FROM users WHERE provider = ? AND external_id = ?')
    .get(sessionUser.provider, sessionUser.userId) as { locale: string | null } | undefined;
  return row && isLocale(row.locale) ? row.locale : null;
}

// Personal preference > instance default > browser language (only when
// first-run setup set locale_auto=1) > DEFAULT_LOCALE. Existing installs have
// no locale_auto, so they keep DEFAULT_LOCALE regardless of Accept-Language.
export function getLocale(
  sessionUser: SessionUser | null,
  db: Database.Database,
  acceptLanguage?: string | null
): Locale {
  return getUserPersonalLocale(sessionUser, db) ?? getInstanceLocale(db, acceptLanguage);
}

// Mailing-list rows are only known by email, never by a session. The most
// recent login with a personal locale wins when the email spans providers.
export function getLocaleByEmail(email: string, db: Database.Database): Locale {
  const row = db
    .prepare('SELECT locale FROM users WHERE lower(email) = lower(?) AND locale IS NOT NULL ORDER BY last_login DESC LIMIT 1')
    .get(email) as { locale: string | null } | undefined;
  if (row && isLocale(row.locale)) return row.locale;
  return getInstanceLocale(db);
}

// Preferred for outbound mail when the member identity is known.
export function getLocaleByIdentity(
  provider: string,
  externalId: string,
  db: Database.Database,
  acceptLanguage?: string | null
): Locale {
  const row = db
    .prepare('SELECT locale FROM users WHERE provider = ? AND external_id = ?')
    .get(provider, externalId) as { locale: string | null } | undefined;
  if (row && isLocale(row.locale)) return row.locale;
  return getInstanceLocale(db, acceptLanguage);
}

export function getInstanceLocale(db: Database.Database, acceptLanguage?: string | null): Locale {
  const defaultLocale = getSetting(db, 'default_locale');
  if (isLocale(defaultLocale)) return defaultLocale;
  if (getSetting(db, 'locale_auto') === '1') return pickBrowserLocale(acceptLanguage ?? null);
  return DEFAULT_LOCALE;
}
