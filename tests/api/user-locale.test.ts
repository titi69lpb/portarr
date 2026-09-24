import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb, resetDbForTests } from '../../src/lib/db';
import { getSetting } from '../../src/lib/settings';
import { createSession, SESSION_COOKIE_NAME } from '../../src/lib/session';
import { POST as userPOST } from '../../src/app/api/user/locale/route';
import { POST as adminPOST } from '../../src/app/api/admin/settings/locale/route';

const SECRET = 'test-secret-at-least-32-characters-long';
let saved: string | undefined;

beforeEach(() => {
  saved = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = SECRET;
  resetDbForTests();
});
afterEach(() => {
  process.env.SESSION_SECRET = saved;
});

async function req(path: string, body: unknown, isOwner: boolean | null): Promise<NextRequest> {
  const r = new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (isOwner !== null) {
    const token = await createSession(
      { provider: 'plex', userId: '1', email: 'u@example.com', username: 'u', isOwner },
      SECRET
    );
    r.cookies.set(SESSION_COOKIE_NAME, token);
  }
  return r;
}

function seedUser(db: ReturnType<typeof getDb>) {
  db.prepare(
    "INSERT INTO users (provider, external_id, email, username, last_login) VALUES ('plex','1','u@example.com','u','')"
  ).run();
}
const personal = (db: ReturnType<typeof getDb>) =>
  (db.prepare("SELECT locale FROM users WHERE provider='plex' AND external_id='1'").get() as { locale: string | null }).locale;

describe('POST /api/user/locale', () => {
  it('401 without session', async () => {
    expect((await userPOST(await req('/api/user/locale', { locale: 'en' }, null))).status).toBe(401);
  });
  it('400 on invalid locale', async () => {
    expect((await userPOST(await req('/api/user/locale', { locale: 'de' }, false))).status).toBe(400);
  });
  it('200 persists and null clears', async () => {
    const db = getDb(':memory:');
    seedUser(db);
    const res = await userPOST(await req('/api/user/locale', { locale: 'en' }, false));
    expect(res.status).toBe(200);
    expect(personal(db)).toBe('en');
    const res2 = await userPOST(await req('/api/user/locale', { locale: null }, false));
    expect(res2.status).toBe(200);
    expect(personal(db)).toBeNull();
  });
});

describe('POST /api/admin/settings/locale', () => {
  it('401 without session', async () => {
    expect((await adminPOST(await req('/api/admin/settings/locale', { locale: 'en' }, null))).status).toBe(401);
  });
  it('403 for non-owner', async () => {
    expect((await adminPOST(await req('/api/admin/settings/locale', { locale: 'en' }, false))).status).toBe(403);
  });
  it('400 on invalid locale', async () => {
    expect((await adminPOST(await req('/api/admin/settings/locale', { locale: 'de' }, true))).status).toBe(400);
  });
  it('200 stores default_locale for owner', async () => {
    const db = getDb(':memory:');
    const res = await adminPOST(await req('/api/admin/settings/locale', { locale: 'en' }, true));
    expect(res.status).toBe(200);
    expect(getSetting(db, 'default_locale')).toBe('en');
  });
});
