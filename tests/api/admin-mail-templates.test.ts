import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb, resetDbForTests } from '../../src/lib/db';
import { createMailTemplate } from '../../src/lib/mail-templates';
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

describe('GET/POST /api/admin/mail-templates', () => {
  it('GET returns 403 for a non-owner session', async () => {
    const { GET } = await import('../../src/app/api/admin/mail-templates/route');
    const request = await memberRequest('http://localhost/api/admin/mail-templates');
    expect((await GET(request)).status).toBe(403);
  });

  it('GET returns the template list for the owner', async () => {
    createMailTemplate(getDb(), 'A', 'Sujet', 'Corps');
    const { GET } = await import('../../src/app/api/admin/mail-templates/route');
    const request = await ownerRequest('http://localhost/api/admin/mail-templates');
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect((await response.json()).templates).toHaveLength(1);
  });

  it('POST returns 400 when a field is blank', async () => {
    const { POST } = await import('../../src/app/api/admin/mail-templates/route');
    const request = await ownerRequest('http://localhost/api/admin/mail-templates', {
      method: 'POST',
      body: JSON.stringify({ name: '', subject: 'S', bodyMarkdown: 'B' }),
    });
    expect((await POST(request)).status).toBe(400);
  });

  it('POST creates a template for the owner', async () => {
    const { POST } = await import('../../src/app/api/admin/mail-templates/route');
    const request = await ownerRequest('http://localhost/api/admin/mail-templates', {
      method: 'POST',
      body: JSON.stringify({ name: 'A', subject: 'Sujet', bodyMarkdown: 'Corps' }),
    });
    const response = await POST(request);
    expect(response.status).toBe(201);
    expect((await response.json()).template.name).toBe('A');
  });
});

describe('PATCH/DELETE /api/admin/mail-templates/[id]', () => {
  it('PATCH returns 404 for a non-existent id', async () => {
    const { PATCH } = await import('../../src/app/api/admin/mail-templates/[id]/route');
    const request = await ownerRequest('http://localhost/api/admin/mail-templates/999', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'x' }),
    });
    const response = await PATCH(request, { params: { id: '999' } });
    expect(response.status).toBe(404);
  });

  it('PATCH updates a template', async () => {
    const created = createMailTemplate(getDb(), 'A', 'Sujet', 'Corps');
    const { PATCH } = await import('../../src/app/api/admin/mail-templates/[id]/route');
    const request = await ownerRequest(`http://localhost/api/admin/mail-templates/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ subject: 'Nouveau sujet' }),
    });
    const response = await PATCH(request, { params: { id: String(created.id) } });
    expect(response.status).toBe(200);
    expect((await response.json()).template.subject).toBe('Nouveau sujet');
  });

  it('DELETE returns 403 for a non-owner session', async () => {
    const created = createMailTemplate(getDb(), 'A', 'Sujet', 'Corps');
    const { DELETE } = await import('../../src/app/api/admin/mail-templates/[id]/route');
    const request = await memberRequest(`http://localhost/api/admin/mail-templates/${created.id}`, {
      method: 'DELETE',
    });
    const response = await DELETE(request, { params: { id: String(created.id) } });
    expect(response.status).toBe(403);
  });

  it('DELETE removes a template for the owner', async () => {
    const created = createMailTemplate(getDb(), 'A', 'Sujet', 'Corps');
    const { DELETE } = await import('../../src/app/api/admin/mail-templates/[id]/route');
    const request = await ownerRequest(`http://localhost/api/admin/mail-templates/${created.id}`, {
      method: 'DELETE',
    });
    const response = await DELETE(request, { params: { id: String(created.id) } });
    expect(response.status).toBe(200);
  });
});

describe('GET /api/admin/mail-templates/[id]/preview', () => {
  it('returns 403 for a non-owner session', async () => {
    const created = createMailTemplate(getDb(), 'A', 'Sujet', '**Corps**');
    const { GET } = await import('../../src/app/api/admin/mail-templates/[id]/preview/route');
    const request = await memberRequest(`http://localhost/api/admin/mail-templates/${created.id}/preview`);
    const response = await GET(request, { params: { id: String(created.id) } });
    expect(response.status).toBe(403);
  });

  it('returns 404 for a non-existent template', async () => {
    const { GET } = await import('../../src/app/api/admin/mail-templates/[id]/preview/route');
    const request = await ownerRequest('http://localhost/api/admin/mail-templates/999/preview');
    const response = await GET(request, { params: { id: '999' } });
    expect(response.status).toBe(404);
  });

  it('returns rendered HTML for the owner', async () => {
    const created = createMailTemplate(getDb(), 'A', 'Sujet', '**Corps**');
    const { GET } = await import('../../src/app/api/admin/mail-templates/[id]/preview/route');
    const request = await ownerRequest(`http://localhost/api/admin/mail-templates/${created.id}/preview`);
    const response = await GET(request, { params: { id: String(created.id) } });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.html).toContain('<strong>Corps</strong>');
  });
});
