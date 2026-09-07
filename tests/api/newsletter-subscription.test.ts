import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb, resetDbForTests } from '../../src/lib/db';
import { createSession, SESSION_COOKIE_NAME } from '../../src/lib/session';

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

async function memberRequest(url: string, init?: ConstructorParameters<typeof NextRequest>[1]): Promise<NextRequest> {
  const token = await createSession(
    { plexId: 'plex-1', email: 'member@b.com', username: 'member', isOwner: false },
    SECRET
  );
  const request = new NextRequest(url, init);
  request.cookies.set(SESSION_COOKIE_NAME, token);
  return request;
}

describe('GET/POST /api/newsletter/subscription', () => {
  it('GET returns 401 with no session', async () => {
    const { GET } = await import('../../src/app/api/newsletter/subscription/route');
    const request = new NextRequest('http://localhost/api/newsletter/subscription');
    expect((await GET(request)).status).toBe(401);
  });

  it('GET returns subscribed:true by default', async () => {
    const { GET } = await import('../../src/app/api/newsletter/subscription/route');
    const request = await memberRequest('http://localhost/api/newsletter/subscription');
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ subscribed: true });
  });

  it('POST updates the subscription for the logged-in user', async () => {
    const { POST } = await import('../../src/app/api/newsletter/subscription/route');
    const request = await memberRequest('http://localhost/api/newsletter/subscription', {
      method: 'POST',
      body: JSON.stringify({ subscribed: false }),
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ subscribed: false });

    const { GET } = await import('../../src/app/api/newsletter/subscription/route');
    const getRequest = await memberRequest('http://localhost/api/newsletter/subscription');
    const getResponse = await GET(getRequest);
    expect(await getResponse.json()).toEqual({ subscribed: false });
  });

  it('POST returns 400 when subscribed is not a boolean', async () => {
    const { POST } = await import('../../src/app/api/newsletter/subscription/route');
    const request = await memberRequest('http://localhost/api/newsletter/subscription', {
      method: 'POST',
      body: JSON.stringify({ subscribed: 'yes' }),
    });
    expect((await POST(request)).status).toBe(400);
  });

  it('POST returns 401 with no session', async () => {
    const { POST } = await import('../../src/app/api/newsletter/subscription/route');
    const request = new NextRequest('http://localhost/api/newsletter/subscription', {
      method: 'POST',
      body: JSON.stringify({ subscribed: false }),
    });
    expect((await POST(request)).status).toBe(401);
  });
});
