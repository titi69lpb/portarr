import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDb, resetDbForTests } from '../../../src/lib/db';
import { setSetting } from '../../../src/lib/settings';

let acceptLanguage: string | null = null;
vi.mock('next/headers', () => ({
  headers: () => ({ get: (name: string) => (name === 'accept-language' ? acceptLanguage : null) }),
}));

import { getRequestLocale } from '../../../src/lib/i18n/request-locale';

describe('getRequestLocale', () => {
  beforeEach(() => {
    resetDbForTests();
    acceptLanguage = null;
  });

  it('passes Accept-Language through when locale_auto is on', () => {
    const db = getDb(':memory:');
    setSetting(db, 'locale_auto', '1');
    acceptLanguage = 'en-US,en;q=0.9';
    expect(getRequestLocale(null, db)).toBe('en');
    acceptLanguage = 'fr-FR';
    expect(getRequestLocale(null, db)).toBe('fr');
  });

  it('ignores Accept-Language without locale_auto (existing installs)', () => {
    const db = getDb(':memory:');
    acceptLanguage = 'en-US';
    expect(getRequestLocale(null, db)).toBe('fr');
  });

  it('instance default wins over the browser', () => {
    const db = getDb(':memory:');
    setSetting(db, 'locale_auto', '1');
    setSetting(db, 'default_locale', 'fr');
    acceptLanguage = 'en-US';
    expect(getRequestLocale(null, db)).toBe('fr');
  });
});
