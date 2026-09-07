import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
});

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.restoreAllMocks();
});

describe('GET /api/dashboard/pending-requests', () => {
  it('returns requests on success', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ results: [] }), { status: 200 })
    );
    const { GET } = await import('../../src/app/api/dashboard/pending-requests/route');
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it('returns 502 when the Overseerr fetch fails', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 500 }));
    const { GET } = await import('../../src/app/api/dashboard/pending-requests/route');
    const response = await GET();
    expect(response.status).toBe(502);
  });
});
