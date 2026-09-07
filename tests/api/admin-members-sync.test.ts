import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb, resetDbForTests } from '../../src/lib/db';
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
  SMTP_HOST: 'mail.local',
  SMTP_PORT: '465',
  SMTP_USER: 'smtpuser',
  SMTP_PASS: 'smtppass',
  MAIL_FROM_ADDRESS: 'admin@local',
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
  vi.restoreAllMocks();
});

async function ownerRequest(url: string): Promise<NextRequest> {
  const token = await createSession(
    { plexId: '1', email: 'owner@b.com', username: 'owner', isOwner: true },
    REQUIRED_ENV.SESSION_SECRET
  );
  const request = new NextRequest(url, { method: 'POST' });
  request.cookies.set(SESSION_COOKIE_NAME, token);
  return request;
}

async function memberRequest(url: string): Promise<NextRequest> {
  const token = await createSession(
    { plexId: '2', email: 'member@b.com', username: 'member', isOwner: false },
    REQUIRED_ENV.SESSION_SECRET
  );
  const request = new NextRequest(url, { method: 'POST' });
  request.cookies.set(SESSION_COOKIE_NAME, token);
  return request;
}

vi.mock('../../src/lib/plex', async () => {
  const actual = await vi.importActual('../../src/lib/plex');
  return { ...actual, getSharedUsers: vi.fn() };
});

describe('POST /api/admin/members/sync', () => {
  it('returns 403 for a non-owner session', async () => {
    const { POST } = await import('../../src/app/api/admin/members/sync/route');
    const request = await memberRequest('http://localhost/api/admin/members/sync');
    expect((await POST(request)).status).toBe(403);
  });

  it('returns 401 with no session', async () => {
    const { POST } = await import('../../src/app/api/admin/members/sync/route');
    const request = new NextRequest('http://localhost/api/admin/members/sync', { method: 'POST' });
    expect((await POST(request)).status).toBe(401);
  });

  it('syncs Plex-shared users into the users table and returns the sync summary', async () => {
    const plexModule = await import('../../src/lib/plex');
    vi.mocked(plexModule.getSharedUsers).mockResolvedValue([
      { plexId: '10', email: 'alice@b.com', username: 'alice' },
      { plexId: '11', email: 'bob@b.com', username: 'bob' },
      { plexId: '12', email: '', username: 'noemail' },
    ]);

    const { POST } = await import('../../src/app/api/admin/members/sync/route');
    const request = await ownerRequest('http://localhost/api/admin/members/sync');
    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ added: 2, updated: 0, skippedNoEmail: 1, total: 2 });

    const rows = getDb().prepare('SELECT plex_id, last_login FROM users ORDER BY plex_id').all();
    expect(rows).toEqual([
      { plex_id: '10', last_login: '' },
      { plex_id: '11', last_login: '' },
    ]);
  });

  it('returns 502 when the Plex API call fails', async () => {
    const plexModule = await import('../../src/lib/plex');
    vi.mocked(plexModule.getSharedUsers).mockRejectedValue(new Error('Plex API request failed'));

    const { POST } = await import('../../src/app/api/admin/members/sync/route');
    const request = await ownerRequest('http://localhost/api/admin/members/sync');
    expect((await POST(request)).status).toBe(502);
  });
});
