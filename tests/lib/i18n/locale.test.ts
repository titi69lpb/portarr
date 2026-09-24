import { describe, it, expect, afterEach } from 'vitest';
import { getDb, resetDbForTests } from '../../../src/lib/db';
import { setSetting } from '../../../src/lib/settings';
import { getLocale, getLocaleByEmail, getUserPersonalLocale, pickBrowserLocale } from '../../../src/lib/i18n/locale';
import { setUserLocale } from '../../../src/lib/user-locale';
import type { SessionUser } from '../../../src/lib/session';

afterEach(() => resetDbForTests());

const user: SessionUser = { provider: 'plex', userId: 'u1', email: 'a@example.com', username: 'a', isOwner: false };

function seed() {
  const db = getDb(':memory:');
  db.prepare("INSERT INTO users (provider, external_id, email, username, last_login) VALUES ('plex','u1','a@example.com','a','x')").run();
  return db;
}

describe('pickBrowserLocale', () => {
  it('maps Accept-Language', () => {
    expect(pickBrowserLocale('fr-FR,fr;q=0.9')).toBe('fr');
    expect(pickBrowserLocale('en-US,en;q=0.9')).toBe('en');
    expect(pickBrowserLocale('de')).toBe('en');
    expect(pickBrowserLocale(null)).toBe('fr');
  });
});

describe('getLocale', () => {
  it('existing install with no settings stays FR even with Accept-Language en', () => {
    const db = seed();
    expect(getLocale(user, db, 'en-US,en;q=0.9')).toBe('fr');
    expect(getLocale(null, db, 'en-US')).toBe('fr');
  });

  it('uses browser language only when locale_auto is 1', () => {
    const db = seed();
    setSetting(db, 'locale_auto', '1');
    expect(getLocale(null, db, 'en-US,en;q=0.9')).toBe('en');
    expect(getLocale(null, db, null)).toBe('fr');
  });

  it('default beats browser', () => {
    const db = seed();
    setSetting(db, 'locale_auto', '1');
    setSetting(db, 'default_locale', 'fr');
    expect(getLocale(null, db, 'en-US')).toBe('fr');
  });

  it('personal beats default', () => {
    const db = seed();
    setSetting(db, 'default_locale', 'fr');
    setUserLocale(db, 'plex', 'u1', 'en');
    expect(getLocale(user, db)).toBe('en');
    expect(getUserPersonalLocale(user, db)).toBe('en');
    setUserLocale(db, 'plex', 'u1', null);
    expect(getLocale(user, db)).toBe('fr');
    expect(getUserPersonalLocale(user, db)).toBeNull();
  });

  it('getLocaleByEmail resolves personal then default', () => {
    const db = seed();
    setSetting(db, 'default_locale', 'en');
    expect(getLocaleByEmail('a@example.com', db)).toBe('en');
    setUserLocale(db, 'plex', 'u1', 'fr');
    expect(getLocaleByEmail('a@example.com', db)).toBe('fr');
    expect(getLocaleByEmail('unknown@example.com', db)).toBe('en');
  });
});
