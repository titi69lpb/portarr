import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb, resetDbForTests } from '../../src/lib/db';
import { hasBeenNotified } from '../../src/lib/request-notifications';
import { resetOverseerrCacheForTests } from '../../src/lib/overseerr';

const CRON_SECRET = 'cron-secret-value';

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
  NEWSLETTER_CRON_SECRET: CRON_SECRET,
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
  resetOverseerrCacheForTests();
});

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetDbForTests();
  vi.restoreAllMocks();
});

vi.mock('../../src/lib/mailer', () => ({
  createTransport: vi.fn(() => ({ sendMail: vi.fn().mockResolvedValue({ messageId: 'x' }) })),
  sendMail: vi.fn().mockResolvedValue(undefined),
}));

function availableRequestResponse(overrides: Partial<{ id: number; tmdbId: number; email: string }> = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      results: [
        {
          id: overrides.id ?? 1045,
          status: 5,
          type: 'movie',
          createdAt: '2025-09-09T07:31:37.000Z',
          media: { tmdbId: overrides.tmdbId ?? 87513, status: 5 },
          requestedBy: {
            username: 'Andaril',
            displayName: 'Andaril',
            email: overrides.email ?? 'admin@b.com',
          },
        },
      ],
    }),
  } as Response;
}

function titleDetailResponse() {
  return { ok: true, status: 200, json: async () => ({ title: 'Some Movie' }) } as Response;
}

describe('POST /api/cron/request-availability', () => {
  it('returns 401 without a secret header', async () => {
    const { POST } = await import('../../src/app/api/cron/request-availability/route');
    const request = new NextRequest('http://localhost/api/cron/request-availability', { method: 'POST' });
    expect((await POST(request)).status).toBe(401);
  });

  it('returns 401 with the wrong secret', async () => {
    const { POST } = await import('../../src/app/api/cron/request-availability/route');
    const request = new NextRequest('http://localhost/api/cron/request-availability', {
      method: 'POST',
      headers: { 'x-cron-secret': 'wrong' },
    });
    expect((await POST(request)).status).toBe(401);
  });

  it('notifies a newly-available request and marks it as notified', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/v1/request')) return availableRequestResponse();
      return titleDetailResponse();
    });

    const { POST } = await import('../../src/app/api/cron/request-availability/route');
    const request = new NextRequest('http://localhost/api/cron/request-availability', {
      method: 'POST',
      headers: { 'x-cron-secret': CRON_SECRET },
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ notified: 1, total: 1, deferredToNextRun: 0 });

    const db = getDb();
    expect(hasBeenNotified(db, 1045)).toBe(true);

    const mailer = await import('../../src/lib/mailer');
    const sendMailMock = vi.mocked(mailer.sendMail);
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'admin@b.com',
      expect.stringContaining('Some Movie'),
      expect.stringContaining('Some Movie')
    );
  });

  it('does not re-notify a request that was already notified on a previous run', async () => {
    const db = getDb();
    const { markNotified } = await import('../../src/lib/request-notifications');
    markNotified(db, 1045);

    vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/v1/request')) return availableRequestResponse();
      return titleDetailResponse();
    });

    const { POST } = await import('../../src/app/api/cron/request-availability/route');
    const request = new NextRequest('http://localhost/api/cron/request-availability', {
      method: 'POST',
      headers: { 'x-cron-secret': CRON_SECRET },
    });
    const response = await POST(request);
    expect(await response.json()).toEqual({ notified: 0, total: 0, deferredToNextRun: 0 });

    const mailer = await import('../../src/lib/mailer');
    expect(vi.mocked(mailer.sendMail)).not.toHaveBeenCalled();
  });

  it('marks a request notified without emailing when there is no requester email on file', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/v1/request')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            results: [
              {
                id: 55,
                status: 5,
                type: 'movie',
                createdAt: '2025-09-09T07:31:37.000Z',
                media: { tmdbId: 1, status: 5 },
                requestedBy: { username: 'noemail', displayName: 'NoEmail' },
              },
            ],
          }),
        } as Response;
      }
      return titleDetailResponse();
    });

    const { POST } = await import('../../src/app/api/cron/request-availability/route');
    const request = new NextRequest('http://localhost/api/cron/request-availability', {
      method: 'POST',
      headers: { 'x-cron-secret': CRON_SECRET },
    });
    await POST(request);

    const db = getDb();
    expect(hasBeenNotified(db, 55)).toBe(true);
    const mailer = await import('../../src/lib/mailer');
    expect(vi.mocked(mailer.sendMail)).not.toHaveBeenCalled();
  });

  it('does not mark a request as notified when sending fails, so it is retried next run', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/v1/request')) return availableRequestResponse({ id: 77 });
      return titleDetailResponse();
    });
    const mailer = await import('../../src/lib/mailer');
    vi.mocked(mailer.sendMail).mockRejectedValueOnce(new Error('SMTP down'));

    const { POST } = await import('../../src/app/api/cron/request-availability/route');
    const request = new NextRequest('http://localhost/api/cron/request-availability', {
      method: 'POST',
      headers: { 'x-cron-secret': CRON_SECRET },
    });
    const response = await POST(request);
    expect(await response.json()).toEqual({ notified: 0, total: 1, deferredToNextRun: 0 });

    const db = getDb();
    expect(hasBeenNotified(db, 77)).toBe(false);
  });

  it('returns 502 when the Overseerr fetch fails', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 500 } as Response);
    const { POST } = await import('../../src/app/api/cron/request-availability/route');
    const request = new NextRequest('http://localhost/api/cron/request-availability', {
      method: 'POST',
      headers: { 'x-cron-secret': CRON_SECRET },
    });
    expect((await POST(request)).status).toBe(502);
  });

  it('caps notifications to 5 per run, deferring the rest to the next run — guards against a batch of restored library items flooding one inbox', async () => {
    const results = Array.from({ length: 8 }, (_, i) => ({
      id: 100 + i,
      status: 5,
      type: 'movie' as const,
      createdAt: '2025-09-09T07:31:37.000Z',
      media: { tmdbId: i, status: 5 },
      requestedBy: { username: 'a', displayName: 'A', email: `a${i}@b.com` },
    }));

    vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/v1/request')) {
        return { ok: true, status: 200, json: async () => ({ results }) } as Response;
      }
      return titleDetailResponse();
    });

    const { POST } = await import('../../src/app/api/cron/request-availability/route');
    const request = new NextRequest('http://localhost/api/cron/request-availability', {
      method: 'POST',
      headers: { 'x-cron-secret': CRON_SECRET },
    });
    const response = await POST(request);
    expect(await response.json()).toEqual({ notified: 5, total: 5, deferredToNextRun: 3 });

    const db = getDb();
    const notifiedCount = results.filter((r) => hasBeenNotified(db, r.id)).length;
    expect(notifiedCount).toBe(5);
  });
});
