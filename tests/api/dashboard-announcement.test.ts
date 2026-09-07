import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb, resetDbForTests } from '../../src/lib/db';
import { createAnnouncement } from '../../src/lib/announcements';
import { createSession, SESSION_COOKIE_NAME } from '../../src/lib/session';

const REQUIRED_ENV: Record<string, string> = {
  DATABASE_PATH: ':memory:',
  SESSION_SECRET: 'test-secret-at-least-32-characters-long',
  PLEX_URL: 'http://plex.local',
  PLEX_SERVER_TOKEN: 'server-token',
  PLEX_SERVER_NAME: 'My Plex Server',
  PLEX_CLIENT_IDENTIFIER: 'cid',
  TAUTULLI_URL: 'http://tautulli.local',
  TAUTULLI_API_KEY: 'tautulli-key',
  SONARR_URL: 'http://sonarr.local',
  SONARR_API_KEY: 'sonarr-key',
  RADARR_URL: 'http://radarr.local',
  RADARR_API_KEY: 'radarr-key',
  SMTP_HOST: 'mail.example.com',
  SMTP_PORT: '465',
  SMTP_USER: 'smtpuser',
  SMTP_PASS: 'smtppass',
  MAIL_FROM_ADDRESS: 'admin@example.com',
  MAIL_FROM_NAME: 'My Plex Server',
  NEWSLETTER_CRON_SECRET: 'a-long-random-cron-secret',
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

async function authedRequest(url: string): Promise<NextRequest> {
  const token = await createSession(
    { plexId: '1', email: 'a@b.com', username: 'alice', isOwner: false },
    REQUIRED_ENV.SESSION_SECRET
  );
  const request = new NextRequest(url);
  request.cookies.set(SESSION_COOKIE_NAME, token);
  return request;
}

describe('GET /api/dashboard/active-announcement', () => {
  it('returns 401 when there is no session', async () => {
    const { GET } = await import('../../src/app/api/dashboard/active-announcement/route');
    const request = new NextRequest('http://localhost/api/dashboard/active-announcement');
    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it('returns announcement: null when nothing is active', async () => {
    const { GET } = await import('../../src/app/api/dashboard/active-announcement/route');
    const request = await authedRequest('http://localhost/api/dashboard/active-announcement');
    const response = await GET(request);
    const body = await response.json();
    expect(body).toEqual({ announcement: null });
  });

  it('returns the active announcement rendered as HTML', async () => {
    createAnnouncement(getDb(), '**important**');
    const { GET } = await import('../../src/app/api/dashboard/active-announcement/route');
    const request = await authedRequest('http://localhost/api/dashboard/active-announcement');
    const response = await GET(request);
    const body = await response.json();
    expect(body.announcement.contentHtml).toContain('<strong>important</strong>');
  });
});
