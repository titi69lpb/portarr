import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb, resetDbForTests } from '../../src/lib/db';
import { isSubscribed } from '../../src/lib/newsletter-subscriptions';
import { setSetting } from '../../src/lib/settings';
import { setUserLocale } from '../../src/lib/user-locale';
import { signUnsubscribeToken } from '../../src/lib/newsletter-token';

const SECRET = 'test-secret-at-least-32-characters-long';

const REQUIRED_ENV: Record<string, string> = {
  DATABASE_PATH: ':memory:',
  SESSION_SECRET: SECRET,
  PLEX_URL: 'https://plex.local',
  PLEX_SERVER_TOKEN: 'server-token',
  PLEX_SERVER_NAME: 'My Plex Server',
  PLEX_CLIENT_IDENTIFIER: 'cid',
  TAUTULLI_URL: 'http://tautulli.local',
  TAUTULLI_API_KEY: 'tautulli-key',
  SONARR_URL: 'http://sonarr.local',
  SONARR_API_KEY: 'sonarr-key',
  RADARR_URL: 'http://radarr.local',
  RADARR_API_KEY: 'radarr-key',
  SMTP_HOST: 'mail.local',
  SMTP_PORT: '465',
  SMTP_USER: 'smtpuser',
  SMTP_PASS: 'smtppass',
  MAIL_FROM_ADDRESS: 'admin@local',
  MAIL_FROM_NAME: 'My Plex Server',
  NEWSLETTER_CRON_SECRET: 'cron-secret',
  PUBLIC_BASE_URL: 'https://portal.example.com',
  OVERSEERR_URL: 'https://overseerr.example.com',
  OVERSEERR_API_KEY: 'overseerr-key',
  FILES_ROOT_PATH: '/mnt/qnap-software',
  DOWNLOAD_SIGNING_SECRET: 'a-long-random-signing-secret',
};

let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = {};
  for (const [key, value] of Object.entries(REQUIRED_ENV)) {
    savedEnv[key] = process.env[key];
    process.env[key] = value;
  }
  resetDbForTests();
  getDb(':memory:');
});

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetDbForTests();
});

describe('GET /api/newsletter/unsubscribe', () => {
  it('shows a confirmation page for a valid token WITHOUT unsubscribing yet', async () => {
    // Regression guard: a state-changing GET here would let mail-client link
    // prefetchers (Outlook SafeLinks, spam scanners) silently unsubscribe
    // people who never clicked anything.
    const token = await signUnsubscribeToken({ provider: 'plex', userId: 'plex-1' }, SECRET);
    const { GET } = await import('../../src/app/api/newsletter/unsubscribe/route');
    const request = new NextRequest(`http://localhost/api/newsletter/unsubscribe?token=${token}`);
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(isSubscribed(getDb(), { provider: 'plex', userId: 'plex-1' })).toBe(true);
    const body = await response.text();
    expect(body).toContain('<form');
    expect(body).toContain(token);
  });

  it('returns 400 for a missing token', async () => {
    const { GET } = await import('../../src/app/api/newsletter/unsubscribe/route');
    const request = new NextRequest('http://localhost/api/newsletter/unsubscribe');
    const response = await GET(request);
    expect(response.status).toBe(400);
  });

  it('returns 400 for an invalid token and does not unsubscribe anyone', async () => {
    const { GET } = await import('../../src/app/api/newsletter/unsubscribe/route');
    const request = new NextRequest('http://localhost/api/newsletter/unsubscribe?token=garbage');
    const response = await GET(request);
    expect(response.status).toBe(400);
  });
});

describe('POST /api/newsletter/unsubscribe', () => {
  it('unsubscribes with a valid token submitted as form data', async () => {
    const token = await signUnsubscribeToken({ provider: 'plex', userId: 'plex-1' }, SECRET);
    const { POST } = await import('../../src/app/api/newsletter/unsubscribe/route');
    const formData = new FormData();
    formData.set('token', token);
    const request = new NextRequest('http://localhost/api/newsletter/unsubscribe', {
      method: 'POST',
      body: formData,
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(isSubscribed(getDb(), { provider: 'plex', userId: 'plex-1' })).toBe(false);
  });

  it('returns 400 for a missing token', async () => {
    const { POST } = await import('../../src/app/api/newsletter/unsubscribe/route');
    const request = new NextRequest('http://localhost/api/newsletter/unsubscribe', {
      method: 'POST',
      body: new FormData(),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('returns 400 for an invalid token and does not unsubscribe anyone', async () => {
    const { POST } = await import('../../src/app/api/newsletter/unsubscribe/route');
    const formData = new FormData();
    formData.set('token', 'garbage');
    const request = new NextRequest('http://localhost/api/newsletter/unsubscribe', {
      method: 'POST',
      body: formData,
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});

describe('unsubscribe pages are localized', () => {
  function seedUser(locale: 'fr' | 'en' | null) {
    const db = getDb();
    db.prepare("INSERT INTO users (provider, external_id, email, username, last_login) VALUES ('plex','plex-1','a@example.com','a','x')").run();
    if (locale) setUserLocale(db, 'plex', 'plex-1', locale);
  }

  it('French confirm page by default', async () => {
    seedUser(null);
    const token = await signUnsubscribeToken({ provider: 'plex', userId: 'plex-1' }, SECRET);
    const { GET } = await import('../../src/app/api/newsletter/unsubscribe/route');
    const body = await (await GET(new NextRequest(`http://localhost/api/newsletter/unsubscribe?token=${token}`))).text();
    expect(body).toContain('<html lang="fr">');
    expect(body).toContain('Se désabonner de la newsletter Portarr ?');
  });

  it('English confirm and done pages from the personal locale', async () => {
    seedUser('en');
    const token = await signUnsubscribeToken({ provider: 'plex', userId: 'plex-1' }, SECRET);
    const { GET, POST } = await import('../../src/app/api/newsletter/unsubscribe/route');
    const confirm = await (await GET(new NextRequest(`http://localhost/api/newsletter/unsubscribe?token=${token}`))).text();
    expect(confirm).toContain('<html lang="en">');
    expect(confirm).toContain('Unsubscribe from the Portarr newsletter?');
    expect(confirm).toContain('>Unsubscribe</button>');
    const formData = new FormData();
    formData.set('token', token);
    const done = await (await POST(new NextRequest('http://localhost/api/newsletter/unsubscribe', { method: 'POST', body: formData }))).text();
    expect(done).toContain('You have been unsubscribed from the newsletter.');
  });

  it('personal locale beats the instance default', async () => {
    seedUser('fr');
    setSetting(getDb(), 'default_locale', 'en');
    const token = await signUnsubscribeToken({ provider: 'plex', userId: 'plex-1' }, SECRET);
    const { GET } = await import('../../src/app/api/newsletter/unsubscribe/route');
    const body = await (await GET(new NextRequest(`http://localhost/api/newsletter/unsubscribe?token=${token}`))).text();
    expect(body).toContain('Se désabonner');
  });

  it('invalid token uses the instance default', async () => {
    setSetting(getDb(), 'default_locale', 'en');
    const { GET } = await import('../../src/app/api/newsletter/unsubscribe/route');
    const res = await GET(new NextRequest('http://localhost/api/newsletter/unsubscribe?token=garbage'));
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('Invalid or expired link.');
  });

  it('invalid token honors Accept-Language only when locale_auto is set', async () => {
    const { GET } = await import('../../src/app/api/newsletter/unsubscribe/route');
    const mk = () =>
      new NextRequest('http://localhost/api/newsletter/unsubscribe?token=garbage', { headers: { 'accept-language': 'en-US,en;q=0.9' } });
    expect(await (await GET(mk())).text()).toContain('Lien invalide ou expiré.');
    setSetting(getDb(), 'locale_auto', '1');
    expect(await (await GET(mk())).text()).toContain('Invalid or expired link.');
  });

  it('missing token page in English', async () => {
    setSetting(getDb(), 'default_locale', 'en');
    const { GET } = await import('../../src/app/api/newsletter/unsubscribe/route');
    const res = await GET(new NextRequest('http://localhost/api/newsletter/unsubscribe'));
    expect(await res.text()).toContain('Invalid link.');
  });
});
