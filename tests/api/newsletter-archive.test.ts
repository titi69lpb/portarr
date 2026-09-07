import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb, resetDbForTests } from '../../src/lib/db';
import { insertNewsletterArchive } from '../../src/lib/newsletter-archive';

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

describe('GET /api/newsletter/archive/[id]', () => {
  it('serves the archived HTML with no session required', async () => {
    const db = getDb();
    const entry = insertNewsletterArchive(db, {
      subject: 'Les Nouveautés My Plex Server! (30/08/2026)',
      html: '<html><body>Nouveautés de la semaine</body></html>',
    });

    const { GET } = await import('../../src/app/api/newsletter/archive/[id]/route');
    const request = new NextRequest(`http://localhost/api/newsletter/archive/${entry.id}`);
    const response = await GET(request, { params: { id: String(entry.id) } });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(await response.text()).toContain('Nouveautés de la semaine');
  });

  it('returns 404 for an id that does not exist', async () => {
    const { GET } = await import('../../src/app/api/newsletter/archive/[id]/route');
    const request = new NextRequest('http://localhost/api/newsletter/archive/999');
    const response = await GET(request, { params: { id: '999' } });
    expect(response.status).toBe(404);
  });

  it('returns 404 for a non-numeric id instead of throwing', async () => {
    const { GET } = await import('../../src/app/api/newsletter/archive/[id]/route');
    const request = new NextRequest('http://localhost/api/newsletter/archive/not-a-number');
    const response = await GET(request, { params: { id: 'not-a-number' } });
    expect(response.status).toBe(404);
  });
});
