import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb, resetDbForTests } from '../../src/lib/db';
import { createAnnouncement, getActiveAnnouncement } from '../../src/lib/announcements';
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
  SMTP_HOST: 'mail.example.com',
  SMTP_PORT: '465',
  SMTP_USER: 'smtpuser',
  SMTP_PASS: 'smtppass',
  MAIL_FROM_ADDRESS: 'admin@example.com',
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

describe('GET/POST /api/admin/announcements', () => {
  it('GET returns 401 with no session', async () => {
    const { GET } = await import('../../src/app/api/admin/announcements/route');
    const request = new NextRequest('http://localhost/api/admin/announcements');
    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it('GET returns 403 for a non-owner session', async () => {
    const { GET } = await import('../../src/app/api/admin/announcements/route');
    const request = await memberRequest('http://localhost/api/admin/announcements');
    const response = await GET(request);
    expect(response.status).toBe(403);
  });

  it('GET returns the announcement list for the owner', async () => {
    createAnnouncement(getDb(), 'Hello');
    const { GET } = await import('../../src/app/api/admin/announcements/route');
    const request = await ownerRequest('http://localhost/api/admin/announcements');
    const response = await GET(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.announcements).toHaveLength(1);
  });

  it('POST returns 400 when contentMarkdown is missing', async () => {
    const { POST } = await import('../../src/app/api/admin/announcements/route');
    const request = await ownerRequest('http://localhost/api/admin/announcements', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('POST creates a new active announcement for the owner', async () => {
    const { POST } = await import('../../src/app/api/admin/announcements/route');
    const request = await ownerRequest('http://localhost/api/admin/announcements', {
      method: 'POST',
      body: JSON.stringify({ contentMarkdown: 'Nouvelle annonce' }),
    });
    const response = await POST(request);
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.announcement.active).toBe(true);
  });

  it('POST returns 403 for a non-owner session', async () => {
    const { POST } = await import('../../src/app/api/admin/announcements/route');
    const request = await memberRequest('http://localhost/api/admin/announcements', {
      method: 'POST',
      body: JSON.stringify({ contentMarkdown: 'x' }),
    });
    const response = await POST(request);
    expect(response.status).toBe(403);
  });
});

describe('PATCH/DELETE /api/admin/announcements/[id]', () => {
  it('PATCH returns 401 with no session', async () => {
    const { PATCH } = await import('../../src/app/api/admin/announcements/[id]/route');
    const request = new NextRequest('http://localhost/api/admin/announcements/1', {
      method: 'PATCH',
    });
    const response = await PATCH(request, { params: { id: '1' } });
    expect(response.status).toBe(401);
  });

  it('PATCH returns 404 for a non-existent id', async () => {
    const { PATCH } = await import('../../src/app/api/admin/announcements/[id]/route');
    const request = await ownerRequest('http://localhost/api/admin/announcements/999', {
      method: 'PATCH',
      body: JSON.stringify({ contentMarkdown: 'x' }),
    });
    const response = await PATCH(request, { params: { id: '999' } });
    expect(response.status).toBe(404);
  });

  it('PATCH updates content', async () => {
    const created = createAnnouncement(getDb(), 'Original');
    const { PATCH } = await import('../../src/app/api/admin/announcements/[id]/route');
    const request = await ownerRequest(`http://localhost/api/admin/announcements/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ contentMarkdown: 'Updated' }),
    });
    const response = await PATCH(request, { params: { id: String(created.id) } });
    expect(response.status).toBe(200);
  });

  it('PATCH with active:true reactivates an old announcement and deactivates the current one', async () => {
    const first = createAnnouncement(getDb(), 'First');
    createAnnouncement(getDb(), 'Second');
    const { PATCH } = await import('../../src/app/api/admin/announcements/[id]/route');
    const request = await ownerRequest(`http://localhost/api/admin/announcements/${first.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ active: true }),
    });
    const response = await PATCH(request, { params: { id: String(first.id) } });
    expect(response.status).toBe(200);
    expect(getActiveAnnouncement(getDb())?.id).toBe(first.id);
  });

  it('DELETE returns 403 for a non-owner session', async () => {
    const created = createAnnouncement(getDb(), 'First');
    const { DELETE } = await import('../../src/app/api/admin/announcements/[id]/route');
    const request = await memberRequest(`http://localhost/api/admin/announcements/${created.id}`, {
      method: 'DELETE',
    });
    const response = await DELETE(request, { params: { id: String(created.id) } });
    expect(response.status).toBe(403);
  });

  it('DELETE removes an announcement for the owner', async () => {
    const created = createAnnouncement(getDb(), 'First');
    const { DELETE } = await import('../../src/app/api/admin/announcements/[id]/route');
    const request = await ownerRequest(`http://localhost/api/admin/announcements/${created.id}`, {
      method: 'DELETE',
    });
    const response = await DELETE(request, { params: { id: String(created.id) } });
    expect(response.status).toBe(200);
  });

  it('DELETE returns 404 for a non-existent id', async () => {
    const { DELETE } = await import('../../src/app/api/admin/announcements/[id]/route');
    const request = await ownerRequest('http://localhost/api/admin/announcements/999', {
      method: 'DELETE',
    });
    const response = await DELETE(request, { params: { id: '999' } });
    expect(response.status).toBe(404);
  });
});
