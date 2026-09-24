import { headers } from 'next/headers';
import type Database from 'better-sqlite3';
import type { SessionUser } from '../session';
import { getLocale } from './locale';
import type { Locale } from './dictionaries';

// Server-component helper: resolves the locale for the current request,
// always feeding Accept-Language so the first-run "auto" mode (locale_auto=1)
// behaves the same on every page. Only callable during a request (headers()).
export function getRequestLocale(sessionUser: SessionUser | null, db: Database.Database): Locale {
  return getLocale(sessionUser, db, headers().get('accept-language'));
}
