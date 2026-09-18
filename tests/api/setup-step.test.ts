// tests/api/setup-step.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb, resetDbForTests } from '../../src/lib/db';
import { getOrCreateSetupToken } from '../../src/lib/setup';
import { getSetting } from '../../src/lib/settings';
import { POST } from '../../src/app/api/setup/step/route';

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
    resetDbForTests();
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
});
