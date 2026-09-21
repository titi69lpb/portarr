import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb, resetDbForTests } from '../../src/lib/db';
import { resetTtlCacheForTests } from '../../src/lib/ttl-cache';
import { createSession, SESSION_COOKIE_NAME } from '../../src/lib/session';

const SECRET = 'test-secret-at-least-32-characters-long';

const ENV: Record<string, string> = {
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

beforeEach(() => {
  saved = {};
  for (const [k, v] of Object.entries(ENV)) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }
  resetDbForTests();
  resetTtlCacheForTests();
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.restoreAllMocks();
});

function json(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, statusText: status === 200 ? 'OK' : 'Error', json: async () => body, text: async () => '<MediaContainer/>' } as unknown as Response;
}

function installFetch(seerr: () => Response) {
  vi.spyOn(global, 'fetch').mockImplementation((async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('plex.tv/api/users')) return json({});
    if (url.endsWith('/Users')) {
      return json([
        { Id: 'a'.repeat(32), Name: 'alice', Policy: { IsAdministrator: true, IsDisabled: false } },
        { Id: 'b'.repeat(32), Name: 'stranger', Policy: { IsAdministrator: false, IsDisabled: false } },
      ]);
    }
    if (url.includes('/api/v1/user')) return seerr();
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch);
}

async function ownerRequest(): Promise<NextRequest> {
  const token = await createSession({ provider: 'plex', userId: '1', email: 'o@b.com', username: 'owner', isOwner: true }, SECRET);
  return new NextRequest('http://localhost/api/admin/members/sync', {
    method: 'POST',
    headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
  });
}

describe('POST /api/admin/members/sync with Jellyfin', () => {
  it('syncs Jellyfin members and fills their emails from Seerr, skipping the ones it cannot match', async () => {
    installFetch(() =>
      json({ pageInfo: { pages: 1 }, results: [{ id: 1, email: 'alice@example.com', displayName: 'Alice', username: null, plexUsername: 'Alice', jellyfinUsername: null, jellyfinUserId: null }] })
    );
    const { POST } = await import('../../src/app/api/admin/members/sync/route');
    const response = await POST(await ownerRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ added: 1, updated: 0, skippedNoEmail: 1, total: 1 });
    const rows = getDb().prepare("SELECT provider, external_id, email, username FROM users").all();
    expect(rows).toEqual([{ provider: 'jellyfin', external_id: 'a'.repeat(32), email: 'alice@example.com', username: 'alice' }]);
  });

  it('still syncs (with no Jellyfin email) when Seerr is down', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    installFetch(() => json({}, 500));
    const { POST } = await import('../../src/app/api/admin/members/sync/route');
    const response = await POST(await ownerRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ added: 0, updated: 0, skippedNoEmail: 2, total: 0 });
  });
});
