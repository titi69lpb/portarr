import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb, resetDbForTests } from '../../src/lib/db';
import { getOrCreateSetupToken } from '../../src/lib/setup';
import { getSetting, setSetting } from '../../src/lib/settings';
import { POST } from '../../src/app/api/setup/locale/route';

const SECRET = 'test-secret-at-least-32-characters-long';
let saved: string | undefined;

function postRequest(body: unknown, token?: string, raw?: string): NextRequest {
  return new NextRequest('http://localhost/api/setup/locale', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: raw ?? JSON.stringify(body),
  });
}

describe('POST /api/setup/locale', () => {
  beforeEach(() => {
    saved = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = SECRET;
    resetDbForTests();
  });
  afterEach(() => {
    process.env.SESSION_SECRET = saved;
  });

  it('persists default_locale and locale_auto with a valid token', async () => {
    const db = getDb(':memory:');
    const token = getOrCreateSetupToken(db);
    const res = await POST(postRequest({ locale: 'en' }, token));
    expect(res.status).toBe(200);
    expect(getSetting(db, 'default_locale')).toBe('en');
    expect(getSetting(db, 'locale_auto')).toBe('1');
  });

  it('rejects a missing token', async () => {
    const db = getDb(':memory:');
    getOrCreateSetupToken(db);
    const res = await POST(postRequest({ locale: 'en' }));
    expect(res.status).toBe(403);
    expect(getSetting(db, 'default_locale')).toBeNull();
  });

  it('rejects an invalid token', async () => {
    const db = getDb(':memory:');
    getOrCreateSetupToken(db);
    const res = await POST(postRequest({ locale: 'en' }, 'wrong'));
    expect(res.status).toBe(403);
    expect(getSetting(db, 'default_locale')).toBeNull();
  });

  it('rejects an invalid locale with 400', async () => {
    const db = getDb(':memory:');
    const token = getOrCreateSetupToken(db);
    const res = await POST(postRequest({ locale: 'de' }, token));
    expect(res.status).toBe(400);
    expect(getSetting(db, 'default_locale')).toBeNull();
  });

  it('rejects malformed JSON with 400', async () => {
    const db = getDb(':memory:');
    const token = getOrCreateSetupToken(db);
    const res = await POST(postRequest(null, token, '{not json'));
    expect(res.status).toBe(400);
  });

  it('refuses with 409 once setup is complete, even with a valid token', async () => {
    const db = getDb(':memory:');
    const token = getOrCreateSetupToken(db);
    const all: Record<string, string> = {
      PUBLIC_BASE_URL: 'https://portarr.example.com',
      PLEX_URL: 'https://plex.example.com',
      PLEX_SERVER_TOKEN: 'plex-token',
      PLEX_SERVER_NAME: 'Srv',
      TAUTULLI_URL: 'https://tautulli.example.com',
      TAUTULLI_API_KEY: 'tkey',
      SONARR_URL: 'https://sonarr.example.com',
      SONARR_API_KEY: 'skey',
      RADARR_URL: 'https://radarr.example.com',
      RADARR_API_KEY: 'rkey',
      OVERSEERR_URL: 'https://overseerr.example.com',
      OVERSEERR_API_KEY: 'okey',
      SMTP_HOST: 'mail.example.com',
      SMTP_PORT: '465',
      SMTP_USER: 'u',
      SMTP_PASS: 'p',
      MAIL_FROM_ADDRESS: 'a@example.com',
      MAIL_FROM_NAME: 'Portarr',
    };
    for (const [k, v] of Object.entries(all)) setSetting(db, k, v);
    const res = await POST(postRequest({ locale: 'en' }, token));
    expect(res.status).toBe(409);
    expect(getSetting(db, 'default_locale')).toBeNull();
  });
});
