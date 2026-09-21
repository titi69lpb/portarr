import { describe, it, expect } from 'vitest';
import { SignJWT } from 'jose';
import { createSession, verifySession } from '../../src/lib/session';

const SECRET = 'test-secret-at-least-32-characters-long';
const KEY = new TextEncoder().encode(SECRET);

async function signRaw(payload: Record<string, unknown>): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(KEY);
}

describe('session', () => {
  it('round-trips a valid session token', async () => {
    const user = { provider: 'plex' as const, userId: '123', email: 'a@b.com', username: 'alice', isOwner: false };
    const token = await createSession(user, SECRET);
    expect(await verifySession(token, SECRET)).toEqual(user);
  });

  it('round-trips isOwner: true', async () => {
    const user = { provider: 'plex' as const, userId: '1', email: 'owner@b.com', username: 'owner', isOwner: true };
    const token = await createSession(user, SECRET);
    expect(await verifySession(token, SECRET)).toEqual(user);
  });

  it('round-trips a jellyfin session', async () => {
    const user = { provider: 'jellyfin' as const, userId: 'abc-def', email: '', username: 'jelly', isOwner: false };
    const token = await createSession(user, SECRET);
    expect(await verifySession(token, SECRET)).toEqual(user);
  });

  it('rejects a token signed with a different secret', async () => {
    const user = { provider: 'plex' as const, userId: '123', email: 'a@b.com', username: 'alice', isOwner: false };
    const token = await createSession(user, SECRET);
    expect(await verifySession(token, 'a-completely-different-secret-value')).toBeNull();
  });

  it('rejects garbage input', async () => {
    expect(await verifySession('not-a-jwt', SECRET)).toBeNull();
  });

  it('rejects a payload missing isOwner (e.g. a token signed before this field existed)', async () => {
    const token = await signRaw({ plexId: '123', email: 'a@b.com', username: 'alice' });
    expect(await verifySession(token, SECRET)).toBeNull();
  });

  it('still accepts a legacy pre-provider session ({ plexId }) and reads it as plex', async () => {
    const token = await signRaw({ plexId: '123', email: 'a@b.com', username: 'alice', isOwner: false });
    expect(await verifySession(token, SECRET)).toEqual({
      provider: 'plex',
      userId: '123',
      email: 'a@b.com',
      username: 'alice',
      isOwner: false,
    });
  });

  it('rejects an unknown provider', async () => {
    const token = await signRaw({ provider: 'emby', userId: '1', email: 'a@b.com', username: 'a', isOwner: false });
    expect(await verifySession(token, SECRET)).toBeNull();
  });

  it('rejects a provider without a userId', async () => {
    const token = await signRaw({ provider: 'plex', email: 'a@b.com', username: 'a', isOwner: false });
    expect(await verifySession(token, SECRET)).toBeNull();
  });
});
