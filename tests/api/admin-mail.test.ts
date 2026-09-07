import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb, resetDbForTests } from '../../src/lib/db';
import { createMailTemplate } from '../../src/lib/mail-templates';
import { createSession, SESSION_COOKIE_NAME } from '../../src/lib/session';
import { hashContent } from '../../src/lib/mail-guard';

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
});

async function ownerRequest(
  url: string,
  init?: ConstructorParameters<typeof NextRequest>[1]
): Promise<NextRequest> {
  const token = await createSession(
    { plexId: '1', email: 'owner@b.com', username: 'owner', isOwner: true },
    REQUIRED_ENV.SESSION_SECRET
  );
  const request = new NextRequest(url, init);
  request.cookies.set(SESSION_COOKIE_NAME, token);
  return request;
}

async function memberRequest(
  url: string,
  init?: ConstructorParameters<typeof NextRequest>[1]
): Promise<NextRequest> {
  const token = await createSession(
    { plexId: '2', email: 'member@b.com', username: 'member', isOwner: false },
    REQUIRED_ENV.SESSION_SECRET
  );
  const request = new NextRequest(url, init);
  request.cookies.set(SESSION_COOKIE_NAME, token);
  return request;
}

vi.mock('../../src/lib/mailer', () => ({
  createTransport: vi.fn(() => ({ sendMail: vi.fn().mockResolvedValue({ messageId: 'x' }) })),
  sendMail: vi.fn().mockResolvedValue(undefined),
}));

describe('POST /api/admin/mail/test', () => {
  it('returns 404 for a non-existent template', async () => {
    const { POST } = await import('../../src/app/api/admin/mail/test/route');
    const request = await ownerRequest('http://localhost/api/admin/mail/test', {
      method: 'POST',
      body: JSON.stringify({ templateId: 999 }),
    });
    expect((await POST(request)).status).toBe(404);
  });

  it('sends a test to the owner and returns the content hash', async () => {
    const created = createMailTemplate(getDb(), 'A', 'Sujet', 'Corps');
    const { POST } = await import('../../src/app/api/admin/mail/test/route');
    const request = await ownerRequest('http://localhost/api/admin/mail/test', {
      method: 'POST',
      body: JSON.stringify({ templateId: created.id }),
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.hash).toBe(hashContent('Sujet', 'Corps'));
  });

  it('returns 403 for a non-owner session', async () => {
    const created = createMailTemplate(getDb(), 'A', 'Sujet', 'Corps');
    const { POST } = await import('../../src/app/api/admin/mail/test/route');
    const request = await memberRequest('http://localhost/api/admin/mail/test', {
      method: 'POST',
      body: JSON.stringify({ templateId: created.id }),
    });
    expect((await POST(request)).status).toBe(403);
  });
});

describe('POST /api/admin/mail/send', () => {
  it('returns 403 when testedHash does not match the current template content', async () => {
    const created = createMailTemplate(getDb(), 'A', 'Sujet', 'Corps');
    const { POST } = await import('../../src/app/api/admin/mail/send/route');
    const request = await ownerRequest('http://localhost/api/admin/mail/send', {
      method: 'POST',
      body: JSON.stringify({
        templateId: created.id,
        testedHash: 'stale-hash',
        target: { mode: 'broadcast' },
      }),
    });
    expect((await POST(request)).status).toBe(403);
  });

  it('sends to every resolved recipient and returns a summary', async () => {
    const created = createMailTemplate(getDb(), 'A', 'Sujet', 'Corps');
    const db = getDb();
    db.prepare(
      'INSERT INTO users (plex_id, email, username, last_login) VALUES (?, ?, ?, ?)'
    ).run('1', 'a@b.com', 'a', new Date().toISOString());
    db.prepare(
      'INSERT INTO users (plex_id, email, username, last_login) VALUES (?, ?, ?, ?)'
    ).run('2', 'c@d.com', 'c', new Date().toISOString());

    const { POST } = await import('../../src/app/api/admin/mail/send/route');
    const request = await ownerRequest('http://localhost/api/admin/mail/send', {
      method: 'POST',
      body: JSON.stringify({
        templateId: created.id,
        testedHash: hashContent('Sujet', 'Corps'),
        target: { mode: 'broadcast' },
      }),
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ sent: 2, failed: 0, total: 2 });
  });

  it('returns 404 for a non-existent template', async () => {
    const { POST } = await import('../../src/app/api/admin/mail/send/route');
    const request = await ownerRequest('http://localhost/api/admin/mail/send', {
      method: 'POST',
      body: JSON.stringify({ templateId: 999, testedHash: 'x', target: { mode: 'broadcast' } }),
    });
    expect((await POST(request)).status).toBe(404);
  });

  it('isolates a per-recipient failure — one bad address does not abort the rest', async () => {
    const created = createMailTemplate(getDb(), 'A', 'Sujet', 'Corps');
    const db = getDb();
    db.prepare(
      'INSERT INTO users (plex_id, email, username, last_login) VALUES (?, ?, ?, ?)'
    ).run('1', 'good1@b.com', 'good1', new Date().toISOString());
    db.prepare(
      'INSERT INTO users (plex_id, email, username, last_login) VALUES (?, ?, ?, ?)'
    ).run('2', 'bad@b.com', 'bad', new Date().toISOString());
    db.prepare(
      'INSERT INTO users (plex_id, email, username, last_login) VALUES (?, ?, ?, ?)'
    ).run('3', 'good2@b.com', 'good2', new Date().toISOString());

    const mailerModule = await import('../../src/lib/mailer');
    vi.mocked(mailerModule.sendMail).mockImplementation(async (_transport, _from, to) => {
      if (to === 'bad@b.com') throw new Error('SMTP rejected');
    });

    const { POST } = await import('../../src/app/api/admin/mail/send/route');
    const request = await ownerRequest('http://localhost/api/admin/mail/send', {
      method: 'POST',
      body: JSON.stringify({
        templateId: created.id,
        testedHash: hashContent('Sujet', 'Corps'),
        target: { mode: 'broadcast' },
      }),
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ sent: 2, failed: 1, total: 3 });

    const { listMailLog } = await import('../../src/lib/mail-log');
    const entries = listMailLog(db);
    const statuses = entries.map((e) => ({ email: e.recipientEmail, status: e.status }));
    expect(statuses).toEqual(
      expect.arrayContaining([
        { email: 'good1@b.com', status: 'sent' },
        { email: 'bad@b.com', status: 'failed' },
        { email: 'good2@b.com', status: 'sent' },
      ])
    );

    vi.mocked(mailerModule.sendMail).mockResolvedValue(undefined);
  });
});

describe('GET /api/admin/mail/log', () => {
  it('returns 403 for a non-owner session', async () => {
    const { GET } = await import('../../src/app/api/admin/mail/log/route');
    const request = await memberRequest('http://localhost/api/admin/mail/log');
    expect((await GET(request)).status).toBe(403);
  });

  it('returns the log for the owner', async () => {
    const { GET } = await import('../../src/app/api/admin/mail/log/route');
    const request = await ownerRequest('http://localhost/api/admin/mail/log');
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect((await response.json()).entries).toEqual([]);
  });
});
