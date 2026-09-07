import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { shouldAllow } from '../src/middleware';
import { createSession, SESSION_COOKIE_NAME } from '../src/lib/session';
import { resetTtlCacheForTests } from '../src/lib/ttl-cache';

const USER = { plexId: '1', email: 'a@b.com', username: 'alice', isOwner: false };

describe('shouldAllow', () => {
  it('always allows /login', () => {
    expect(shouldAllow('/login', null)).toBe(true);
  });

  it('always allows /api/auth/* routes', () => {
    expect(shouldAllow('/api/auth/login', null)).toBe(true);
    expect(shouldAllow('/api/auth/poll', null)).toBe(true);
  });

  it('denies the dashboard when there is no session', () => {
    expect(shouldAllow('/', null)).toBe(false);
  });

  it('allows the dashboard when there is a valid session', () => {
    expect(shouldAllow('/', USER)).toBe(true);
  });

  it('denies protected API routes when there is no session', () => {
    expect(shouldAllow('/api/dashboard/recently-added', null)).toBe(false);
  });

  it('allows the newsletter poster proxy with no session', () => {
    expect(shouldAllow('/api/newsletter/poster', null)).toBe(true);
  });

  it('allows the newsletter unsubscribe route with no session', () => {
    expect(shouldAllow('/api/newsletter/unsubscribe', null)).toBe(true);
  });

  it('still requires a session for the newsletter subscription route', () => {
    expect(shouldAllow('/api/newsletter/subscription', null)).toBe(false);
  });

  it('allows the newsletter send route with no session, so its own secret-or-owner check can run', () => {
    expect(shouldAllow('/api/admin/newsletter/send', null)).toBe(true);
  });

  it('allows the newsletter web archive with no session', () => {
    expect(shouldAllow('/api/newsletter/archive/7', null)).toBe(true);
  });

  it('allows the request-availability cron route with no session, so its own secret check can run', () => {
    expect(shouldAllow('/api/cron/request-availability', null)).toBe(true);
  });

  it('allows static newsletter illustration assets with no session — email clients fetching images are never logged in', () => {
    expect(shouldAllow('/newsletter/box-office.jpg', null)).toBe(true);
  });

  it('allows the PWA manifest with no session — install prompts fetch it before any login', () => {
    expect(shouldAllow('/manifest.webmanifest', null)).toBe(true);
  });

  it('allows the service worker script with no session — a redirect to /login would break registration', () => {
    expect(shouldAllow('/sw.js', null)).toBe(true);
  });
});

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

async function requestWithSession(
  path: string,
  user: { plexId: string; email: string; username: string; isOwner: boolean }
): Promise<NextRequest> {
  const token = await createSession(user, REQUIRED_ENV.SESSION_SECRET);
  const request = new NextRequest(`http://localhost${path}`);
  request.cookies.set(SESSION_COOKIE_NAME, token);
  return request;
}

describe('middleware — session revalidation', () => {
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

  it('redirects to /login and clears the cookie when a non-owner session is no longer shared on Plex', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response('<MediaContainer></MediaContainer>', { status: 200 })
    );
    const { middleware } = await import('../src/middleware');
    const request = await requestWithSession('/', {
      plexId: '1',
      email: 'a@b.com',
      username: 'alice',
      isOwner: false,
    });

    const response = await middleware(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/login');
    expect(response.cookies.get(SESSION_COOKIE_NAME)?.value).toBe('');
  });

  it('allows a non-owner session through when still shared on Plex', async () => {
    const xml = `<MediaContainer><User id="1" username="alice" email="a@b.com"><Server id="s1" name="My Plex Server" /></User></MediaContainer>`;
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(xml, { status: 200 }));
    const { middleware } = await import('../src/middleware');
    const request = await requestWithSession('/', {
      plexId: '1',
      email: 'a@b.com',
      username: 'alice',
      isOwner: false,
    });

    const response = await middleware(request);

    expect(response.status).toBe(200);
  });

  it('never re-checks an owner session against the shared-users list', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    const { middleware } = await import('../src/middleware');
    const request = await requestWithSession('/', {
      plexId: 'owner-1',
      email: 'owner@b.com',
      username: 'owner',
      isOwner: true,
    });

    const response = await middleware(request);

    expect(response.status).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fails open — a Plex API error during revalidation still allows the session through', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 503 }));
    const { middleware } = await import('../src/middleware');
    const request = await requestWithSession('/', {
      plexId: '1',
      email: 'a@b.com',
      username: 'alice',
      isOwner: false,
    });

    const response = await middleware(request);

    expect(response.status).toBe(200);
  });
});
