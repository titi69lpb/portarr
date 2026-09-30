import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getDb, resetDbForTests } from '../../src/lib/db';
import { completeLogin, isSecureRequest, resolveLoginEmail } from '../../src/lib/login';
import { verifySession, SESSION_COOKIE_NAME } from '../../src/lib/session';
import type { MediaMember } from '../../src/lib/media/types';

const SECRET = 'test-secret-at-least-32-characters-long';

beforeEach(() => {
  resetDbForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const jf = (email = ''): MediaMember => ({ provider: 'jellyfin', userId: 'a'.repeat(32), username: 'alice', email });

describe('completeLogin', () => {
  it('upserts the user and sets a verifiable session cookie', async () => {
    const db = getDb(':memory:');
    const response = await completeLogin(db, SECRET, jf('a@b.com'), true);
    expect(await response.json()).toEqual({ status: 'ok' });
    const cookie = response.cookies.get(SESSION_COOKIE_NAME);
    expect(cookie?.value).toBeTruthy();
    expect(await verifySession(cookie!.value, SECRET)).toEqual({
      provider: 'jellyfin',
      userId: 'a'.repeat(32),
      username: 'alice',
      email: 'a@b.com',
      isOwner: true,
    });
    const row = db.prepare("SELECT email, username FROM users WHERE provider = 'jellyfin' AND external_id = ?").get('a'.repeat(32));
    expect(row).toEqual({ email: 'a@b.com', username: 'alice' });
  });

  it('keeps an existing email when the new login has none (Jellyfin has no email of its own)', async () => {
    const db = getDb(':memory:');
    db.prepare("INSERT INTO users (provider, external_id, email, username, last_login) VALUES ('jellyfin', ?, 'kept@b.com', 'old', '')").run('a'.repeat(32));
    await completeLogin(db, SECRET, jf(''), false);
    const row = db.prepare("SELECT email, username FROM users WHERE provider = 'jellyfin' AND external_id = ?").get('a'.repeat(32)) as { email: string; username: string };
    expect(row.email).toBe('kept@b.com');
    expect(row.username).toBe('alice');
  });

  it('still overwrites the email when a provider supplies a new non-empty one', async () => {
    const db = getDb(':memory:');
    db.prepare("INSERT INTO users (provider, external_id, email, username, last_login) VALUES ('jellyfin', ?, 'old@b.com', 'x', '')").run('a'.repeat(32));
    await completeLogin(db, SECRET, jf('new@b.com'), false);
    const row = db.prepare("SELECT email FROM users WHERE external_id = ?").get('a'.repeat(32)) as { email: string };
    expect(row.email).toBe('new@b.com');
  });
});

describe('resolveLoginEmail', () => {
  const seerrOk = () =>
    vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        pageInfo: { pages: 1 },
        results: [{ id: 1, email: 'seerr@b.com', displayName: 'Alice', username: null, plexUsername: null, jellyfinUsername: null, jellyfinUserId: null }],
      }),
    }) as unknown as Response) as unknown as typeof fetch;

  it('returns the member untouched when it already has an email', async () => {
    const db = getDb(':memory:');
    const fetchFn = seerrOk();
    expect(await resolveLoginEmail(db, jf('has@b.com'), { url: 'http://s', apiKey: 'k' }, fetchFn)).toEqual(jf('has@b.com'));
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('uses the email already stored for that member without calling Seerr', async () => {
    const db = getDb(':memory:');
    db.prepare("INSERT INTO users (provider, external_id, email, username, last_login) VALUES ('jellyfin', ?, 'stored@b.com', 'alice', '')").run('a'.repeat(32));
    const fetchFn = seerrOk();
    expect((await resolveLoginEmail(db, jf(''), { url: 'http://s', apiKey: 'k' }, fetchFn)).email).toBe('stored@b.com');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('looks the email up in Seerr when nothing is stored', async () => {
    const db = getDb(':memory:');
    expect((await resolveLoginEmail(db, jf(''), { url: 'http://s', apiKey: 'k' }, seerrOk())).email).toBe('seerr@b.com');
  });

  it('never fails the login when Seerr is unreachable or not configured', async () => {
    const db = getDb(':memory:');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const failing = vi.fn(async () => {
      throw new Error('down');
    }) as unknown as typeof fetch;
    expect((await resolveLoginEmail(db, jf(''), { url: 'http://s', apiKey: 'k' }, failing)).email).toBe('');
    expect((await resolveLoginEmail(db, jf(''), null, seerrOk())).email).toBe('');
  });
});

describe('isSecureRequest', () => {
  it('is false for plain HTTP without a proxy', () => {
    expect(isSecureRequest(new Request('http://192.168.1.10:3000/api/auth/poll'))).toBe(false);
  });
  it('is true for an https URL', () => {
    expect(isSecureRequest(new Request('https://portal.example.com/api/auth/poll'))).toBe(true);
  });
  it('trusts x-forwarded-proto behind a TLS proxy', () => {
    const https = new Request('http://app:3000/x', { headers: { 'x-forwarded-proto': 'https' } });
    const http = new Request('https://app/x', { headers: { 'x-forwarded-proto': 'http' } });
    expect(isSecureRequest(https)).toBe(true);
    expect(isSecureRequest(http)).toBe(false);
  });
});

describe('completeLogin cookie', () => {
  it('omits the Secure flag when asked, so plain-HTTP installs keep the session', async () => {
    const res = await completeLogin(getDb(), SECRET, jf('a@b.com'), false, false);
    expect(res.headers.get('set-cookie')).not.toMatch(/secure/i);
  });
});
