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
  // The tautulli lib functions this route calls are now cached — every test here
  // uses the same TAUTULLI_URL/user, so without this a later test (e.g. the 502
  // case) would silently reuse an earlier test's successful cached result.
  resetTtlCacheForTests();
});

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.restoreAllMocks();
});

const HOME_STATS_RESPONSE = {
  response: {
    data: [
      {
        stat_id: 'top_movies',
        rows: [{ title: 'Movie A', total_plays: 42, users_watched: 5 }],
      },
      {
        stat_id: 'popular_tv',
        rows: [{ title: 'Show B', users_watched: 7, total_plays: 3 }],
      },
      {
        stat_id: 'top_users',
        rows: [{ friendly_name: 'alice', total_plays: 12 }],
      },
    ],
  },
};

const USERS_TABLE_RESPONSE = {
  response: {
    data: {
      data: [{ email: 'owner@b.com', plays: 10, duration: 3600, user_id: 42 }],
    },
  },
};

const MOVIE_HISTORY_RESPONSE = {
  response: {
    data: {
      recordsFiltered: 3,
      data: [{ duration: 3600 }, { duration: 1800 }, { duration: 900 }],
    },
  },
};

const EPISODE_HISTORY_RESPONSE = {
  response: {
    data: {
      recordsFiltered: 2,
      data: [{ duration: 1200 }, { duration: 1200 }],
    },
  },
};

const RECENT_HISTORY_RESPONSE = {
  response: {
    data: {
      data: [
        {
          media_type: 'movie',
          title: 'Fight Club',
          thumb: '/library/metadata/40425/thumb/1',
          date: 1788035871,
        },
      ],
    },
  },
};

async function authedRequest(url: string): Promise<NextRequest> {
  const token = await createSession(
    { plexId: '1', email: 'owner@b.com', username: 'owner', isOwner: true },
    'test-secret-at-least-32-characters-long'
  );
  const request = new NextRequest(url);
  request.cookies.set(SESSION_COOKIE_NAME, token);
  return request;
}

describe('GET /api/dashboard/stats', () => {
  it('returns personal and extended stats on success', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify(HOME_STATS_RESPONSE), { status: 200 })
    );
    const { GET } = await import('../../src/app/api/dashboard/stats/route');
    const response = await GET(new NextRequest('http://localhost/api/dashboard/stats'));

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.personal).toBeNull();

    // extended key
    expect(body.extended.topMovies).toEqual([{ title: 'Movie A', value: 42 }]);
  });

  it('returns personalByType breakdown for a logged-in user', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('cmd=get_users_table')) {
        return new Response(JSON.stringify(USERS_TABLE_RESPONSE), { status: 200 });
      }
      if (url.includes('cmd=get_history') && url.includes('media_type=movie')) {
        return new Response(JSON.stringify(MOVIE_HISTORY_RESPONSE), { status: 200 });
      }
      if (url.includes('cmd=get_history') && url.includes('media_type=episode')) {
        return new Response(JSON.stringify(EPISODE_HISTORY_RESPONSE), { status: 200 });
      }
      return new Response(JSON.stringify(HOME_STATS_RESPONSE), { status: 200 });
    });
    const { GET } = await import('../../src/app/api/dashboard/stats/route');
    const response = await GET(await authedRequest('http://localhost/api/dashboard/stats'));

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.personalByType).toEqual({
      movies: { count: 3, hours: 1.75 },
      episodes: { count: 2, hours: 0.6666666666666666 },
    });
  });

  it('returns recentHistory for a logged-in user, and an empty array when logged out', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('cmd=get_users_table')) {
        return new Response(JSON.stringify(USERS_TABLE_RESPONSE), { status: 200 });
      }
      if (url.includes('cmd=get_history') && url.includes('media_type=movie')) {
        return new Response(JSON.stringify(MOVIE_HISTORY_RESPONSE), { status: 200 });
      }
      if (url.includes('cmd=get_history') && url.includes('media_type=episode')) {
        return new Response(JSON.stringify(EPISODE_HISTORY_RESPONSE), { status: 200 });
      }
      if (url.includes('cmd=get_history')) {
        return new Response(JSON.stringify(RECENT_HISTORY_RESPONSE), { status: 200 });
      }
      return new Response(JSON.stringify(HOME_STATS_RESPONSE), { status: 200 });
    });

    const { GET } = await import('../../src/app/api/dashboard/stats/route');

    const loggedOut = await GET(new NextRequest('http://localhost/api/dashboard/stats'));
    expect((await loggedOut.json()).recentHistory).toEqual([]);

    const loggedIn = await GET(await authedRequest('http://localhost/api/dashboard/stats'));
    const body = await loggedIn.json();
    expect(body.recentHistory).toEqual([
      {
        title: 'Fight Club',
        type: 'movie',
        thumbPath: '/library/metadata/40425/thumb/1',
        watchedAt: new Date(1788035871 * 1000).toISOString(),
      },
    ]);
  });

  it('returns 502 when the Tautulli fetch fails', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 500 }));
    const { GET } = await import('../../src/app/api/dashboard/stats/route');
    const response = await GET(new NextRequest('http://localhost/api/dashboard/stats'));
    expect(response.status).toBe(502);
  });
});
