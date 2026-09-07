import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createSession, SESSION_COOKIE_NAME } from '../../src/lib/session';
import { resetTtlCacheForTests } from '../../src/lib/ttl-cache';

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
  PUBLIC_BASE_URL: 'https://portal.local',
  OVERSEERR_URL: 'https://overseerr.local',
  OVERSEERR_API_KEY: 'overseerr-key',
  FILES_ROOT_PATH: '/mnt/qnap-software',
  DOWNLOAD_SIGNING_SECRET: 'a-long-random-signing-secret',
};

const USERS_TABLE_RESPONSE = {
  response: {
    data: { data: [{ email: 'owner@b.com', user_id: 42 }] },
  },
};

let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = {};
  for (const [key, value] of Object.entries(REQUIRED_ENV)) {
    savedEnv[key] = process.env[key];
    process.env[key] = value;
  }
  resetTtlCacheForTests();
});

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.restoreAllMocks();
});

async function authedRequest(url: string): Promise<NextRequest> {
  const token = await createSession(
    { plexId: '1', email: 'owner@b.com', username: 'owner', isOwner: true },
    'test-secret-at-least-32-characters-long'
  );
  const request = new NextRequest(url);
  request.cookies.set(SESSION_COOKIE_NAME, token);
  return request;
}

describe('GET /api/history', () => {
  it('returns 401 when there is no session', async () => {
    const { GET } = await import('../../src/app/api/history/route');
    const response = await GET(new NextRequest('http://localhost/api/history'));
    expect(response.status).toBe(401);
  });

  it('returns a page of history items and the total count for a logged-in user', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('cmd=get_users_table')) {
        return new Response(JSON.stringify(USERS_TABLE_RESPONSE), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          response: {
            data: {
              recordsFiltered: 40,
              data: [{ media_type: 'movie', title: 'Fight Club', thumb: '/thumb/1', date: 1 }],
            },
          },
        }),
        { status: 200 }
      );
    });
    const { GET } = await import('../../src/app/api/history/route');
    const response = await GET(await authedRequest('http://localhost/api/history?offset=30'));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.total).toBe(40);
    expect(body.items).toHaveLength(1);
  });

  it('requests the offset passed in the query string', async () => {
    let capturedUrl = '';
    vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('cmd=get_users_table')) {
        return new Response(JSON.stringify(USERS_TABLE_RESPONSE), { status: 200 });
      }
      capturedUrl = url;
      return new Response(
        JSON.stringify({ response: { data: { recordsFiltered: 0, data: [] } } }),
        { status: 200 }
      );
    });
    const { GET } = await import('../../src/app/api/history/route');
    await GET(await authedRequest('http://localhost/api/history?offset=60'));
    expect(capturedUrl).toContain('start=60');
  });

  it('treats a negative or non-numeric offset as 0 rather than passing it through', async () => {
    let capturedUrl = '';
    vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('cmd=get_users_table')) {
        return new Response(JSON.stringify(USERS_TABLE_RESPONSE), { status: 200 });
      }
      capturedUrl = url;
      return new Response(
        JSON.stringify({ response: { data: { recordsFiltered: 0, data: [] } } }),
        { status: 200 }
      );
    });
    const { GET } = await import('../../src/app/api/history/route');
    await GET(await authedRequest('http://localhost/api/history?offset=not-a-number'));
    expect(capturedUrl).toContain('start=0');
  });

  it('returns 502 when the Tautulli fetch fails', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('cmd=get_users_table')) {
        return new Response(JSON.stringify(USERS_TABLE_RESPONSE), { status: 200 });
      }
      return new Response(null, { status: 500 });
    });
    const { GET } = await import('../../src/app/api/history/route');
    const response = await GET(await authedRequest('http://localhost/api/history'));
    expect(response.status).toBe(502);
  });
});
