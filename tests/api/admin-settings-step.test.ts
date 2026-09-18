import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb, resetDbForTests } from '../../src/lib/db';
import { getSetting } from '../../src/lib/settings';
import { createSession, SESSION_COOKIE_NAME } from '../../src/lib/session';
import { POST } from '../../src/app/api/admin/settings/step/route';

const SECRET = 'test-secret-at-least-32-characters-long';
let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = { SESSION_SECRET: process.env.SESSION_SECRET };
  process.env.SESSION_SECRET = SECRET;
  resetDbForTests();
});

afterEach(() => {
  process.env.SESSION_SECRET = savedEnv.SESSION_SECRET;
});

async function ownerRequest(body: unknown): Promise<NextRequest> {
  const token = await createSession({ plexId: '1', email: 'owner@example.com', username: 'owner', isOwner: true }, SECRET);
  const request = new NextRequest('http://localhost/api/admin/settings/step', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  request.cookies.set(SESSION_COOKIE_NAME, token);
  return request;
}

describe('POST /api/admin/settings/step', () => {
  it('rejects without a session', async () => {
    const request = new NextRequest('http://localhost/api/admin/settings/step', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service: 'publicBaseUrl', values: { PUBLIC_BASE_URL: 'https://x.example.com' } }),
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('rejects a non-owner session', async () => {
    const token = await createSession({ plexId: '1', email: 'u@example.com', username: 'u', isOwner: false }, SECRET);
    const request = new NextRequest('http://localhost/api/admin/settings/step', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service: 'publicBaseUrl', values: { PUBLIC_BASE_URL: 'https://x.example.com' } }),
    });
    request.cookies.set(SESSION_COOKIE_NAME, token);
    const response = await POST(request);
    expect(response.status).toBe(403);
  });

  it('accepts and persists for an owner session', async () => {
    const db = getDb(':memory:');
    const request = await ownerRequest({ service: 'publicBaseUrl', values: { PUBLIC_BASE_URL: 'https://x.example.com' } });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(getSetting(db, 'PUBLIC_BASE_URL')).toBe('https://x.example.com');
  });
});
