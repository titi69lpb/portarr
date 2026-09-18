import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb, resetDbForTests } from '../../src/lib/db';
import { getOrCreateSetupToken, verifySetupToken } from '../../src/lib/setup';
import { setSetting } from '../../src/lib/settings';
import { POST } from '../../src/app/api/setup/complete/route';

// loadConfig (called by this route to re-derive isSetupComplete server-side)
// fails closed when SESSION_SECRET is unset, independent of setup progress
// (src/lib/config.ts) — set it here like every other route test that ends up
// calling loadConfig.
const SECRET = 'test-secret-at-least-32-characters-long';
let savedEnv: Record<string, string | undefined> = {};

const ALL_KEYS = {
  PUBLIC_BASE_URL: 'https://portarr.example.com',
  PLEX_URL: 'https://plex.example.com',
  PLEX_SERVER_TOKEN: 'token',
  PLEX_SERVER_NAME: 'Srv',
  TAUTULLI_URL: 'https://tautulli.example.com',
  TAUTULLI_API_KEY: 'tkey',
  SONARR_URL: 'https://sonarr.example.com',
  SONARR_API_KEY: 'skey',
  RADARR_URL: 'https://radarr.example.com',
  RADARR_API_KEY: 'rkey',
  OVERSEERR_URL: 'https://overseerr.example.com',
  OVERSEERR_API_KEY: 'okey',
  SMTP_HOST: 'mail.example.com',
  SMTP_PORT: '465',
  SMTP_USER: 'u',
  SMTP_PASS: 'p',
  MAIL_FROM_ADDRESS: 'a@example.com',
  MAIL_FROM_NAME: 'Portarr',
};

function postRequest(token?: string): NextRequest {
  return new NextRequest('http://localhost/api/setup/complete', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

describe('POST /api/setup/complete', () => {
  beforeEach(() => {
    savedEnv = { SESSION_SECRET: process.env.SESSION_SECRET };
    process.env.SESSION_SECRET = SECRET;
    resetDbForTests();
  });

  afterEach(() => {
    process.env.SESSION_SECRET = savedEnv.SESSION_SECRET;
  });

  it('rejects without a valid setup token', async () => {
    const response = await POST(postRequest('wrong'));
    expect(response.status).toBe(403);
  });

  it('rejects with 422 when setup is not actually complete yet', async () => {
    const db = getDb(':memory:');
    const token = getOrCreateSetupToken(db);
    const response = await POST(postRequest(token));
    expect(response.status).toBe(422);
  });

  it('invalidates the token and succeeds once every field is set', async () => {
    const db = getDb(':memory:');
    const token = getOrCreateSetupToken(db);
    for (const [key, value] of Object.entries(ALL_KEYS)) {
      setSetting(db, key, value);
    }
    const response = await POST(postRequest(token));
    expect(response.status).toBe(200);
    expect(verifySetupToken(db, token)).toBe(false);
  });
});
