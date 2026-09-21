import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb, resetDbForTests } from '../../src/lib/db';
import { resetRateLimitsForTests } from '../../src/lib/rate-limit';
import { resetTtlCacheForTests } from '../../src/lib/ttl-cache';
import { verifySession, SESSION_COOKIE_NAME } from '../../src/lib/session';

const SESSION_SECRET = 'test-secret-at-least-32-characters-long';
const UID = '1a2b3c4d5e6f47a8b9c0d1e2f3a4b5c6';
const PASSWORD = 'correct-horse-battery-staple';

const BASE_ENV: Record<string, string> = {
  DATABASE_PATH: ':memory:',
  SESSION_SECRET,
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
  OVERSEERR_URL: 'http://seerr.local:5055',
  OVERSEERR_API_KEY: 'seerr-key',
  SMTP_HOST: 'mail.local',
  SMTP_PORT: '465',
  SMTP_USER: 'u',
  SMTP_PASS: 'p',
  MAIL_FROM_ADDRESS: 'admin@local',
  MAIL_FROM_NAME: 'Portarr',
  PUBLIC_BASE_URL: 'https://portal.example.com',
  JELLYFIN_URL: 'http://jellyfin.local:8096',
  JELLYFIN_API_KEY: 'jf-key',
};

let saved: Record<string, string | undefined> = {};
let fetchLog: string[] = [];

function jsonRes(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, statusText: status === 200 ? 'OK' : 'Error', json: async () => body } as unknown as Response;
}

function installFetch(opts: { auth?: () => Response; seerr?: () => Response } = {}) {
  const auth =
    opts.auth ??
    (() => jsonRes({ User: { Id: UID, Name: 'alice', Policy: { IsAdministrator: true, IsDisabled: false } }, AccessToken: 'usertoken' }));
  const seerr =
    opts.seerr ??
    (() => jsonRes({ pageInfo: { pages: 1 }, results: [{ id: 1, email: 'alice@example.com', displayName: 'Alice', username: null, plexUsername: 'Alice', jellyfinUsername: null, jellyfinUserId: null }] }));
  vi.spyOn(global, 'fetch').mockImplementation((async (input: string | URL | Request) => {
    const url = String(input);
    fetchLog.push(url);
    if (url.includes('/Users/AuthenticateByName')) return auth();
    if (url.includes('/Sessions/Logout')) return jsonRes(null, 204);
    if (url.includes('/api/v1/user')) return seerr();
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch);
}

function request(body: unknown, ip = '10.0.0.1'): NextRequest {
  return new NextRequest('http://localhost/api/auth/password', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const login = (overrides: Record<string, unknown> = {}, ip?: string) =>
  request({ provider: 'jellyfin', username: 'alice', password: PASSWORD, ...overrides }, ip);

beforeEach(() => {
  saved = {};
  for (const [k, v] of Object.entries(BASE_ENV)) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }
  fetchLog = [];
  resetDbForTests();
  resetRateLimitsForTests();
  resetTtlCacheForTests();
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.restoreAllMocks();
});

describe('POST /api/auth/password', () => {
  it('logs a jellyfin user in: session cookie, user row with the Seerr email, temporary Jellyfin session ended', async () => {
    installFetch();
    const { POST } = await import('../../src/app/api/auth/password/route');
    const response = await POST(login());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
    const cookie = response.cookies.get(SESSION_COOKIE_NAME);
    expect(await verifySession(cookie!.value, SESSION_SECRET)).toEqual({
      provider: 'jellyfin',
      userId: UID,
      username: 'alice',
      email: 'alice@example.com',
      isOwner: true,
    });
    const row = getDb().prepare("SELECT email FROM users WHERE provider = 'jellyfin' AND external_id = ?").get(UID);
    expect(row).toEqual({ email: 'alice@example.com' });
    expect(fetchLog.some((u) => u.includes('/Sessions/Logout'))).toBe(true);
  });

  it('never puts the password in the response, the cookie or the logs', async () => {
    installFetch();
    const logSpies = [
      vi.spyOn(console, 'log').mockImplementation(() => {}),
      vi.spyOn(console, 'error').mockImplementation(() => {}),
      vi.spyOn(console, 'warn').mockImplementation(() => {}),
    ];
    const { POST } = await import('../../src/app/api/auth/password/route');
    const response = await POST(login());
    expect(JSON.stringify(await response.json())).not.toContain(PASSWORD);
    expect(response.cookies.get(SESSION_COOKIE_NAME)?.value).not.toContain(PASSWORD);
    for (const spy of logSpies) expect(JSON.stringify(spy.mock.calls)).not.toContain(PASSWORD);
  });

  it('answers 401 denied, with no cookie, for wrong credentials (401 from Jellyfin)', async () => {
    installFetch({ auth: () => jsonRes('Error processing request.', 401) });
    const { POST } = await import('../../src/app/api/auth/password/route');
    const response = await POST(login());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ status: 'denied' });
    expect(response.cookies.get(SESSION_COOKIE_NAME)).toBeUndefined();
  });

  it('answers 401 denied for a disabled account', async () => {
    installFetch({ auth: () => jsonRes({ User: { Id: UID, Name: 'alice', Policy: { IsAdministrator: false, IsDisabled: true } }, AccessToken: 't' }) });
    const { POST } = await import('../../src/app/api/auth/password/route');
    const response = await POST(login());
    expect(response.status).toBe(401);
    expect(response.cookies.get(SESSION_COOKIE_NAME)).toBeUndefined();
  });

  it('still logs in, with an empty email, when Seerr is down', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    installFetch({ seerr: () => jsonRes({}, 500) });
    const { POST } = await import('../../src/app/api/auth/password/route');
    const response = await POST(login());
    expect(response.status).toBe(200);
    const cookie = response.cookies.get(SESSION_COOKIE_NAME);
    expect((await verifySession(cookie!.value, SESSION_SECRET))?.email).toBe('');
  });

  it('keeps an email already stored for the member and does not call Seerr', async () => {
    installFetch();
    getDb().prepare("INSERT INTO users (provider, external_id, email, username, last_login) VALUES ('jellyfin', ?, 'stored@example.com', 'alice', '')").run(UID);
    const { POST } = await import('../../src/app/api/auth/password/route');
    const response = await POST(login());
    expect(response.status).toBe(200);
    expect(fetchLog.some((u) => u.includes('/api/v1/user'))).toBe(false);
    const row = getDb().prepare("SELECT email FROM users WHERE external_id = ?").get(UID);
    expect(row).toEqual({ email: 'stored@example.com' });
  });

  it('rejects malformed requests with 400 and never calls Jellyfin', async () => {
    installFetch();
    const { POST } = await import('../../src/app/api/auth/password/route');
    for (const body of [
      'not json',
      'null',
      '123',
      '"text"',
      '[]',
      { provider: 'plex', username: 'a', password: 'b' },
      { provider: 'jellyfin', username: '', password: 'b' },
      { provider: 'jellyfin', username: 'a' },
      { provider: 'jellyfin', username: 'a', password: 'x'.repeat(257) },
      { provider: 'jellyfin', username: 'x'.repeat(129), password: 'b' },
    ]) {
      const response = await POST(request(body, `10.0.1.${Math.floor(Math.random() * 200)}`));
      expect(response.status).toBe(400);
    }
    expect(fetchLog).toHaveLength(0);
  });

  it('answers 400 provider_unavailable when Jellyfin is not configured', async () => {
    installFetch();
    delete process.env.JELLYFIN_URL;
    delete process.env.JELLYFIN_API_KEY;
    const { POST } = await import('../../src/app/api/auth/password/route');
    const response = await POST(login());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'provider_unavailable' });
  });

  it('answers 503 setup_incomplete before setup is done', async () => {
    installFetch();
    delete process.env.SONARR_URL;
    const { POST } = await import('../../src/app/api/auth/password/route');
    const response = await POST(login());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'setup_incomplete' });
  });

  it('rate-limits per IP: the 11th attempt in the window is refused with the French message', async () => {
    installFetch({ auth: () => jsonRes('nope', 401) });
    const { POST } = await import('../../src/app/api/auth/password/route');
    for (let i = 0; i < 10; i++) {
      expect((await POST(login({ username: `user${i}` }, '10.9.9.9'))).status).toBe(401);
    }
    const blocked = await POST(login({ username: 'user11' }, '10.9.9.9'));
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ error: 'Trop de tentatives, réessayez plus tard.' });
  });

  it('rate-limits per username even across different IPs: the 6th attempt is refused', async () => {
    installFetch({ auth: () => jsonRes('nope', 401) });
    const { POST } = await import('../../src/app/api/auth/password/route');
    for (let i = 0; i < 5; i++) {
      expect((await POST(login({ username: 'Alice' }, `10.1.0.${i}`))).status).toBe(401);
    }
    const blocked = await POST(login({ username: 'alice' }, '10.1.0.99'));
    expect(blocked.status).toBe(429);
  });

  it('answers 502 when Jellyfin fails, without leaking anything about the request', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    installFetch({ auth: () => jsonRes({}, 500) });
    const { POST } = await import('../../src/app/api/auth/password/route');
    const response = await POST(login());
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain(PASSWORD);
  });
});
