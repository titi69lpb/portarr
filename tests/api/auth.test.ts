import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { resolvePinToSession } from '../../src/lib/media/plex-pin';
import { GET as pollGET } from '../../src/app/api/auth/poll/route';
import { POST as loginPOST } from '../../src/app/api/auth/login/route';
import { POST as logoutPOST } from '../../src/app/api/auth/logout/route';
import { SESSION_COOKIE_NAME } from '../../src/lib/session';
import { resetRateLimitsForTests } from '../../src/lib/rate-limit';

const REQUIRED_ENV = {
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
  PUBLIC_BASE_URL: 'https://portal.example.com',
  OVERSEERR_URL: 'https://overseerr.example.com',
  OVERSEERR_API_KEY: 'overseerr-key',
  FILES_ROOT_PATH: '/mnt/qnap-software',
  DOWNLOAD_SIGNING_SECRET: 'a-long-random-signing-secret',
};

const REQUIRED_ENV_VARS = Object.keys(REQUIRED_ENV) as (keyof typeof REQUIRED_ENV)[];

let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = {};
  for (const [key, value] of Object.entries(REQUIRED_ENV)) {
    savedEnv[key] = process.env[key];
    process.env[key] = value;
  }
  resetRateLimitsForTests();
});

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.restoreAllMocks();
});

/** Clears the vars loadConfig() requires so it throws, without touching anything else. */
function clearRequiredEnv(): Record<string, string | undefined> {
  const saved: Record<string, string | undefined> = {};
  for (const key of REQUIRED_ENV_VARS as unknown as string[]) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  return saved;
}

function restoreEnv(saved: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe('resolvePinToSession', () => {
  it('returns pending when the pin has no token yet', async () => {
    const deps = {
      pollPin: vi.fn().mockResolvedValue(null),
      getPlexIdentity: vi.fn(),
      getSharedUsers: vi.fn(),
    };
    const result = await resolvePinToSession(123, deps as never, {
      clientIdentifier: 'cid',
      serverToken: 'server-token',
      serverName: 'My Plex Server',
    });
    expect(result).toEqual({ status: 'pending' });
  });

  it('returns denied when the user is not a shared member of the server', async () => {
    const deps = {
      pollPin: vi.fn().mockResolvedValue('user-token'),
      getPlexIdentity: vi.fn().mockImplementation(async (token: string) =>
        token === 'server-token'
          ? { provider: 'plex', userId: '2', email: 'owner@example.com', username: 'owner' }
          : { provider: 'plex', userId: '99', email: 'stranger@example.com', username: 'stranger' }
      ),
      getSharedUsers: vi.fn().mockResolvedValue([{ provider: 'plex', userId: '1', email: 'a@b.com', username: 'a' }]),
    };
    const result = await resolvePinToSession(123, deps as never, {
      clientIdentifier: 'cid',
      serverToken: 'server-token',
      serverName: 'My Plex Server',
    });
    expect(result).toEqual({ status: 'denied' });
  });

  it('returns ok with the session user when the user is shared', async () => {
    const sharedUser = { provider: 'plex', userId: '1', email: 'a@b.com', username: 'alice' };
    const deps = {
      pollPin: vi.fn().mockResolvedValue('user-token'),
      getPlexIdentity: vi.fn().mockImplementation(async (token: string) =>
        token === 'server-token'
          ? { provider: 'plex', userId: '2', email: 'owner@example.com', username: 'owner' }
          : sharedUser
      ),
      getSharedUsers: vi.fn().mockResolvedValue([sharedUser]),
    };
    const result = await resolvePinToSession(123, deps as never, {
      clientIdentifier: 'cid',
      serverToken: 'server-token',
      serverName: 'My Plex Server',
    });
    expect(result).toEqual({ status: 'ok', user: sharedUser, isOwner: false });
  });

  it('returns ok with the owner identity when the visitor is the server owner (not a shared user)', async () => {
    const ownerIdentity = { provider: 'plex', userId: '1', email: 'owner@example.com', username: 'owner' };
    const deps = {
      pollPin: vi.fn().mockResolvedValue('owner-user-token'),
      getPlexIdentity: vi.fn().mockResolvedValue(ownerIdentity),
      getSharedUsers: vi.fn().mockResolvedValue([]),
    };
    const result = await resolvePinToSession(123, deps as never, {
      clientIdentifier: 'cid',
      serverToken: 'server-token',
      serverName: 'My Plex Server',
    });
    expect(result).toEqual({ status: 'ok', user: ownerIdentity, isOwner: true });
    expect(deps.getPlexIdentity).toHaveBeenCalledWith('server-token', 'cid');
    expect(deps.getSharedUsers).not.toHaveBeenCalled();
  });
});

describe('POST /api/auth/login error handling', () => {
  it('returns a JSON 502 error instead of throwing when config/plex calls fail', async () => {
    const saved = clearRequiredEnv();
    try {
      const request = new NextRequest('http://localhost/api/auth/login', { method: 'POST' });
      const response = await loginPOST(request);
      expect(response.status).toBe(502);
      const body = await response.json();
      expect(typeof body.error).toBe('string');
    } finally {
      restoreEnv(saved);
    }
  });
});

describe('GET /api/auth/poll error handling', () => {
  it('returns a JSON 502 error instead of throwing when config/plex calls fail', async () => {
    const saved = clearRequiredEnv();
    try {
      const request = new NextRequest('http://localhost/api/auth/poll?pinId=123');
      const response = await pollGET(request);
      expect(response.status).toBe(502);
      const body = await response.json();
      expect(typeof body.error).toBe('string');
    } finally {
      restoreEnv(saved);
    }
  });

  it('still returns 400 for a missing pinId without needing config', async () => {
    const request = new NextRequest('http://localhost/api/auth/poll');
    const response = await pollGET(request);
    expect(response.status).toBe(400);
  });

  it('returns 503 with error setup_incomplete when setup is not yet complete', async () => {
    // Save only the setup-related env vars (keep SESSION_SECRET which is required)
    const saved: Record<string, string | undefined> = {};
    const setupVars = ['PLEX_URL', 'PLEX_SERVER_TOKEN', 'PLEX_SERVER_NAME',
                       'TAUTULLI_URL', 'TAUTULLI_API_KEY',
                       'SONARR_URL', 'SONARR_API_KEY',
                       'RADARR_URL', 'RADARR_API_KEY',
                       'OVERSEERR_URL', 'OVERSEERR_API_KEY',
                       'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS',
                       'MAIL_FROM_ADDRESS', 'MAIL_FROM_NAME',
                       'PUBLIC_BASE_URL'];

    for (const key of setupVars) {
      saved[key] = process.env[key];
      delete process.env[key];
    }

    try {
      // Use dynamic import to ensure the route is loaded with modified env vars
      const { GET: pollGETDynamic } = await import('../../src/app/api/auth/poll/route');
      const request = new NextRequest('http://localhost/api/auth/poll?pinId=123');
      const response = await pollGETDynamic(request);
      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body).toEqual({ error: 'setup_incomplete' });
    } finally {
      // Restore env
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  });
});

describe('POST /api/auth/logout', () => {
  it('clears the session cookie with the same path (/) it was originally set with', async () => {
    const response = await logoutPOST();
    const setCookie = response.headers.get('set-cookie');
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain('Path=/');
    expect(setCookie).toMatch(/Expires=Thu, 01 Jan 1970/);
  });
});
