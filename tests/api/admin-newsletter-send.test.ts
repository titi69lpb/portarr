import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb, resetDbForTests } from '../../src/lib/db';
import { createSession, SESSION_COOKIE_NAME } from '../../src/lib/session';
import { setSubscribed } from '../../src/lib/newsletter-subscriptions';
import { resetTtlCacheForTests } from '../../src/lib/ttl-cache';

const SECRET = 'test-secret-at-least-32-characters-long';
const CRON_SECRET = 'cron-secret-value';

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
  // getRecentlyAdded (used to build the newsletter body) is now cached — every
  // test here uses the same PLEX_URL, so without this a later test would see
  // an earlier test's mocked Hub response.
  resetTtlCacheForTests();
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

async function mockedSendMail() {
  const mailer = await import('../../src/lib/mailer');
  return mailer.sendMail as unknown as ReturnType<typeof vi.fn>;
}

// getNewsletterItems -> getRecentlyAdded fans out to two Hub calls (type=1
// movies, type=2 TV) via Promise.all and reads JSON (MediaContainer.Metadata)
// — route each mock response by the requested `type` query param. Mirrors
// the hubFetchMock helper in tests/lib/plex.test.ts.
function hubFetchMock(movies: Record<string, unknown>[] = [], tv: Record<string, unknown>[] = []) {
  return async (input: RequestInfo | URL) => {
    const isMovies = String(input).includes('type=1');
    return new Response(JSON.stringify({ MediaContainer: { Metadata: isMovies ? movies : tv } }), { status: 200 });
  };
}

async function ownerRequest(init?: ConstructorParameters<typeof NextRequest>[1]): Promise<NextRequest> {
  const token = await createSession(
    { plexId: 'owner-1', email: 'owner@b.com', username: 'owner', isOwner: true },
    SECRET
  );
  const request = new NextRequest('http://localhost/api/admin/newsletter/send', init);
  request.cookies.set(SESSION_COOKIE_NAME, token);
  return request;
}

describe('POST /api/admin/newsletter/send', () => {
  it('returns 401 with no secret and no session', async () => {
    const { POST } = await import('../../src/app/api/admin/newsletter/send/route');
    const request = new NextRequest('http://localhost/api/admin/newsletter/send', { method: 'POST' });
    expect((await POST(request)).status).toBe(401);
  });

  it('returns 401 with an incorrect secret', async () => {
    const { POST } = await import('../../src/app/api/admin/newsletter/send/route');
    const request = new NextRequest('http://localhost/api/admin/newsletter/send', {
      method: 'POST',
      headers: { 'x-newsletter-secret': 'wrong' },
    });
    expect((await POST(request)).status).toBe(401);
  });

  it('returns 403 for a valid but non-owner session', async () => {
    const token = await createSession(
      { plexId: 'member-1', email: 'member@b.com', username: 'member', isOwner: false },
      SECRET
    );
    const { POST } = await import('../../src/app/api/admin/newsletter/send/route');
    const request = new NextRequest('http://localhost/api/admin/newsletter/send', { method: 'POST' });
    request.cookies.set(SESSION_COOKIE_NAME, token);
    expect((await POST(request)).status).toBe(403);
  });

  it('skips sending when there are no items in the window (correct secret)', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(hubFetchMock());
    const { POST } = await import('../../src/app/api/admin/newsletter/send/route');
    const request = new NextRequest('http://localhost/api/admin/newsletter/send', {
      method: 'POST',
      headers: { 'x-newsletter-secret': CRON_SECRET },
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sent: 0, failed: 0, total: 0, skipped: true });
  });

  it('sends to subscribed users, skips unsubscribed ones (owner session)', async () => {
    const recentAddedAt = Math.floor((Date.now() - 1 * 24 * 60 * 60 * 1000) / 1000);
    vi.spyOn(global, 'fetch').mockImplementation(
      hubFetchMock([{ title: 'A Movie', thumb: '/library/metadata/1/thumb/1', addedAt: recentAddedAt, type: 'movie' }])
    );

    const db = getDb();
    db.prepare('INSERT INTO users (plex_id, email, username, last_login) VALUES (?, ?, ?, ?)').run(
      'plex-a', 'a@b.com', 'a', new Date().toISOString()
    );
    db.prepare('INSERT INTO users (plex_id, email, username, last_login) VALUES (?, ?, ?, ?)').run(
      'plex-b', 'b@b.com', 'b', new Date().toISOString()
    );
    setSubscribed(db, 'plex-b', false);

    const request = await ownerRequest({ method: 'POST' });
    const { POST } = await import('../../src/app/api/admin/newsletter/send/route');
    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ sent: 1, failed: 0, total: 1, skipped: false });

    const { listMailLog } = await import('../../src/lib/mail-log');
    const entries = listMailLog(db);
    expect(entries).toHaveLength(1);
    expect(entries[0].recipientEmail).toBe('a@b.com');

    const sendMailMock = await mockedSendMail();
    const html = sendMailMock.mock.calls[0][4] as string;
    expect(html).toContain('/api/newsletter/unsubscribe?token=');
    expect(html).toMatch(/\/api\/newsletter\/archive\/\d+/);

    const { getNewsletterArchive } = await import('../../src/lib/newsletter-archive');
    const archiveIdMatch = html.match(/\/api\/newsletter\/archive\/(\d+)/);
    const archived = getNewsletterArchive(db, Number(archiveIdMatch?.[1]));
    expect(archived?.subject).toContain('Les Nouveautés');
    expect(archived?.html).toContain('A Movie');
  });
});
