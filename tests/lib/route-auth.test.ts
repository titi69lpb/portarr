import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createSession, SESSION_COOKIE_NAME } from '../../src/lib/session';
import { requireOwner, getSessionUser } from '../../src/lib/route-auth';

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
});

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function requestWithSession(isOwner: boolean): Promise<NextRequest> {
  const token = await createSession(
    { plexId: '1', email: 'u@b.com', username: 'u', isOwner },
    REQUIRED_ENV.SESSION_SECRET
  );
  const request = new NextRequest('http://localhost/api/admin/whatever');
  request.cookies.set(SESSION_COOKIE_NAME, token);
  return request;
}

describe('requireOwner', () => {
  it('returns 401 when there is no session cookie', async () => {
    const request = new NextRequest('http://localhost/api/admin/whatever');
    const denied = await requireOwner(request);
    expect(denied?.status).toBe(401);
  });

  it('returns 403 for a non-owner session', async () => {
    const request = await requestWithSession(false);
    const denied = await requireOwner(request);
    expect(denied?.status).toBe(403);
  });

  it('returns null (allow) for an owner session', async () => {
    const request = await requestWithSession(true);
    const denied = await requireOwner(request);
    expect(denied).toBeNull();
  });
});

describe('getSessionUser', () => {
  it('returns null when there is no session cookie', async () => {
    const request = new NextRequest('http://localhost/api/whatever');
    expect(await getSessionUser(request)).toBeNull();
  });

  it('returns the session user when a valid cookie is present', async () => {
    const request = await requestWithSession(false);
    const user = await getSessionUser(request);
    expect(user?.email).toBe('u@b.com');
  });
});
