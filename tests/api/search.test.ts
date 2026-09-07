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

describe('GET /api/search', () => {
  it('returns 401 when there is no session', async () => {
    const { GET } = await import('../../src/app/api/search/route');
    const response = await GET(new NextRequest('http://localhost/api/search?q=fight'));
    expect(response.status).toBe(401);
  });

  it('returns an empty result list without calling Plex for a blank query', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    const { GET } = await import('../../src/app/api/search/route');
    const response = await GET(await authedRequest('http://localhost/api/search'));

    expect(response.status).toBe(200);
    expect((await response.json()).results).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns Plex search results for a logged-in user, each with a Plex Web deep link', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/identity')) {
        return new Response(JSON.stringify({ MediaContainer: { machineIdentifier: 'abc123' } }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          MediaContainer: {
            Hub: [{ type: 'movie', Metadata: [{ title: 'Fight Club', year: 1999, thumb: '/thumb/1', ratingKey: '111' }] }],
          },
        }),
        { status: 200 }
      );
    });
    const { GET } = await import('../../src/app/api/search/route');
    const response = await GET(await authedRequest('http://localhost/api/search?q=fight'));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.results).toEqual([
      {
        title: 'Fight Club',
        year: 1999,
        type: 'movie',
        thumbPath: '/thumb/1',
        plexWebUrl: 'https://plex.local/web/index.html#!/server/abc123/details?key=%2Flibrary%2Fmetadata%2F111',
      },
    ]);
  });

  it('returns 502 when the Plex fetch fails', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 500 }));
    const { GET } = await import('../../src/app/api/search/route');
    const response = await GET(await authedRequest('http://localhost/api/search?q=fight'));
    expect(response.status).toBe(502);
  });
});
