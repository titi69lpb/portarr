import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { resetRateLimitsForTests } from '../../src/lib/rate-limit';

const REQUIRED_ENV: Record<string, string> = {
  DATABASE_PATH: ':memory:',
  SESSION_SECRET: 'test-secret-at-least-32-characters-long',
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
  resetRateLimitsForTests();
});

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.restoreAllMocks();
});

function loginRequest(ip: string = '203.0.113.1') {
  return new NextRequest('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'x-forwarded-for': ip },
  });
}

describe('POST /api/auth/login', () => {
  it('creates a PIN on success', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(
      async () => new Response(JSON.stringify({ id: 1, code: 'ABCD' }), { status: 200 })
    );
    const { POST } = await import('../../src/app/api/auth/login/route');
    const response = await POST(loginRequest());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.pinId).toBe(1);
  });

  it('returns 429 after exceeding the per-IP rate limit', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(
      async () => new Response(JSON.stringify({ id: 1, code: 'ABCD' }), { status: 200 })
    );
    const { POST } = await import('../../src/app/api/auth/login/route');
    for (let i = 0; i < 10; i++) {
      expect((await POST(loginRequest('198.51.100.9'))).status).toBe(200);
    }
    expect((await POST(loginRequest('198.51.100.9'))).status).toBe(429);
  });

  it('rate-limits each IP independently', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(
      async () => new Response(JSON.stringify({ id: 1, code: 'ABCD' }), { status: 200 })
    );
    const { POST } = await import('../../src/app/api/auth/login/route');
    for (let i = 0; i < 10; i++) {
      await POST(loginRequest('198.51.100.10'));
    }
    expect((await POST(loginRequest('198.51.100.11'))).status).toBe(200);
  });
});
