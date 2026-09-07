import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb, resetDbForTests } from '../../src/lib/db';
import { isSubscribed } from '../../src/lib/newsletter-subscriptions';
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
    const token = await signUnsubscribeToken('plex-1', SECRET);
    const { GET } = await import('../../src/app/api/newsletter/unsubscribe/route');
    const request = new NextRequest(`http://localhost/api/newsletter/unsubscribe?token=${token}`);
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(isSubscribed(getDb(), 'plex-1')).toBe(true);
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
    const token = await signUnsubscribeToken('plex-1', SECRET);
    const { POST } = await import('../../src/app/api/newsletter/unsubscribe/route');
    const formData = new FormData();
    formData.set('token', token);
    const request = new NextRequest('http://localhost/api/newsletter/unsubscribe', {
      method: 'POST',
      body: formData,
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(isSubscribed(getDb(), 'plex-1')).toBe(false);
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
