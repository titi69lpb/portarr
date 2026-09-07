import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { resolvePinToSession } from '../../src/app/api/auth/poll/resolvePinToSession';
import { GET as pollGET } from '../../src/app/api/auth/poll/route';
import { POST as loginPOST } from '../../src/app/api/auth/login/route';
import { POST as logoutPOST } from '../../src/app/api/auth/logout/route';
import { SESSION_COOKIE_NAME } from '../../src/lib/session';

const REQUIRED_ENV_VARS = [
  'DATABASE_PATH',
  'SESSION_SECRET',
  'PLEX_URL',
  'PLEX_SERVER_TOKEN',
  'PLEX_SERVER_NAME',
  'PLEX_CLIENT_IDENTIFIER',
  'TAUTULLI_URL',
  'TAUTULLI_API_KEY',
  'SONARR_URL',
  'SONARR_API_KEY',
  'RADARR_URL',
  'RADARR_API_KEY',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'MAIL_FROM_ADDRESS',
  'MAIL_FROM_NAME',
  'NEWSLETTER_CRON_SECRET',
  'PUBLIC_BASE_URL',
  'OVERSEERR_URL',
  'OVERSEERR_API_KEY',
  'FILES_ROOT_PATH',
  'DOWNLOAD_SIGNING_SECRET',
] as const;

/** Clears the vars loadConfig() requires so it throws, without touching anything else. */
function clearRequiredEnv(): Record<string, string | undefined> {
  const saved: Record<string, string | undefined> = {};
  for (const key of REQUIRED_ENV_VARS) {
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
          ? { plexId: '2', email: 'owner@example.com', username: 'owner' }
          : { plexId: '99', email: 'stranger@example.com', username: 'stranger' }
      ),
      getSharedUsers: vi.fn().mockResolvedValue([{ plexId: '1', email: 'a@b.com', username: 'a' }]),
    };
    const result = await resolvePinToSession(123, deps as never, {
      clientIdentifier: 'cid',
      serverToken: 'server-token',
      serverName: 'My Plex Server',
    });
    expect(result).toEqual({ status: 'denied' });
  });

  it('returns ok with the session user when the user is shared', async () => {
    const sharedUser = { plexId: '1', email: 'a@b.com', username: 'alice' };
    const deps = {
      pollPin: vi.fn().mockResolvedValue('user-token'),
      getPlexIdentity: vi.fn().mockImplementation(async (token: string) =>
        token === 'server-token'
          ? { plexId: '2', email: 'owner@example.com', username: 'owner' }
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
    const ownerIdentity = { plexId: '1', email: 'owner@example.com', username: 'owner' };
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
