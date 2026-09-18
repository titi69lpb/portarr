// tests/api/setup-step.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb, resetDbForTests } from '../../src/lib/db';
import { getOrCreateSetupToken } from '../../src/lib/setup';
import { getSetting, setSetting } from '../../src/lib/settings';
import { POST } from '../../src/app/api/setup/step/route';

const SECRET = 'test-secret-at-least-32-characters-long';
let savedEnv: Record<string, string | undefined> = {};

function postRequest(body: unknown, token?: string): NextRequest {
  return new NextRequest('http://localhost/api/setup/step', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/setup/step', () => {
  beforeEach(() => {
    savedEnv = { SESSION_SECRET: process.env.SESSION_SECRET };
    // The route's setup-already-complete guard calls loadConfig(), which
    // requires SESSION_SECRET to be set (see src/lib/config.ts) — matches
    // the pattern used in tests/api/admin-settings-step.test.ts.
    process.env.SESSION_SECRET = SECRET;
    resetDbForTests();
  });

  afterEach(() => {
    process.env.SESSION_SECRET = savedEnv.SESSION_SECRET;
  });

  it('rejects without a valid setup token', async () => {
    const request = postRequest({ service: 'publicBaseUrl', values: { PUBLIC_BASE_URL: 'https://portarr.example.com' } }, 'wrong-token');
    const response = await POST(request);
    expect(response.status).toBe(403);
  });

  it('accepts and persists with the correct token', async () => {
    const db = getDb(':memory:');
    const token = getOrCreateSetupToken(db);
    const request = postRequest({ service: 'publicBaseUrl', values: { PUBLIC_BASE_URL: 'https://portarr.example.com' } }, token);
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(getSetting(db, 'PUBLIC_BASE_URL')).toBe('https://portarr.example.com');
  });

  it('returns the connection-test error from applyServiceSettings', async () => {
    const db = getDb(':memory:');
    const token = getOrCreateSetupToken(db);
    const request = postRequest(
      { service: 'plex', values: { PLEX_URL: 'https://plex.invalid', PLEX_SERVER_TOKEN: 'bad', PLEX_SERVER_NAME: 'X' } },
      token
    );
    const response = await POST(request);
    expect(response.status).toBe(422);
  });

  it('rejects with missing Authorization header entirely', async () => {
    const request = postRequest({ service: 'publicBaseUrl', values: { PUBLIC_BASE_URL: 'https://portarr.example.com' } }, undefined);
    const response = await POST(request);
    expect(response.status).toBe(403);
  });

  it('rejects missing service/values in request body with valid token', async () => {
    const db = getDb(':memory:');
    const token = getOrCreateSetupToken(db);
    const request = postRequest({ /* no service or values */ }, token);
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('rejects unrecognized service key with 400', async () => {
    const db = getDb(':memory:');
    const token = getOrCreateSetupToken(db);
    const request = postRequest(
      { service: 'not-a-real-service', values: { SOME_FIELD: 'value' } },
      token
    );
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('rejects with 409 when setup is already complete, even with a valid token', async () => {
    const db = getDb(':memory:');
    const token = getOrCreateSetupToken(db);
    setSetting(db, 'PUBLIC_BASE_URL', 'https://portarr.example.com');
    setSetting(db, 'PLEX_URL', 'https://plex.example.com');
    setSetting(db, 'PLEX_SERVER_TOKEN', 'plex-token');
    setSetting(db, 'PLEX_SERVER_NAME', 'My Plex Server');
    setSetting(db, 'TAUTULLI_URL', 'https://tautulli.example.com');
    setSetting(db, 'TAUTULLI_API_KEY', 'tautulli-key');
    setSetting(db, 'SONARR_URL', 'https://sonarr.example.com');
    setSetting(db, 'SONARR_API_KEY', 'sonarr-key');
    setSetting(db, 'RADARR_URL', 'https://radarr.example.com');
    setSetting(db, 'RADARR_API_KEY', 'radarr-key');
    setSetting(db, 'OVERSEERR_URL', 'https://overseerr.example.com');
    setSetting(db, 'OVERSEERR_API_KEY', 'overseerr-key');
    setSetting(db, 'SMTP_HOST', 'mail.example.com');
    setSetting(db, 'SMTP_PORT', '465');
    setSetting(db, 'SMTP_USER', 'smtp-user');
    setSetting(db, 'SMTP_PASS', 'smtp-pass');
    setSetting(db, 'MAIL_FROM_ADDRESS', 'noreply@example.com');
    setSetting(db, 'MAIL_FROM_NAME', 'Portarr');

    const request = postRequest({ service: 'publicBaseUrl', values: { PUBLIC_BASE_URL: 'https://attacker.example.com' } }, token);
    const response = await POST(request);
    expect(response.status).toBe(409);
    // Confirms the guard actually blocked the write, not just returned an error status.
    expect(getSetting(db, 'PUBLIC_BASE_URL')).toBe('https://portarr.example.com');
  });

  it('rejects malformed JSON body with 400', async () => {
    const db = getDb(':memory:');
    const token = getOrCreateSetupToken(db);
    const request = new NextRequest('http://localhost/api/setup/step', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: '{invalid json',
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
