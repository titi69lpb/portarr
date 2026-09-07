import { describe, it, expect } from 'vitest';
import { createSession, verifySession } from '../../src/lib/session';

const SECRET = 'test-secret-at-least-32-characters-long';

describe('session', () => {
  it('round-trips a valid session token', async () => {
    const user = { plexId: '123', email: 'a@b.com', username: 'alice', isOwner: false };
    const token = await createSession(user, SECRET);
    const result = await verifySession(token, SECRET);
    expect(result).toEqual(user);
  });

  it('round-trips isOwner: true', async () => {
    const user = { plexId: '1', email: 'owner@b.com', username: 'owner', isOwner: true };
    const token = await createSession(user, SECRET);
    const result = await verifySession(token, SECRET);
    expect(result).toEqual(user);
  });

  it('rejects a token signed with a different secret', async () => {
    const user = { plexId: '123', email: 'a@b.com', username: 'alice', isOwner: false };
    const token = await createSession(user, SECRET);
    const result = await verifySession(token, 'a-completely-different-secret-value');
    expect(result).toBeNull();
  });

  it('rejects garbage input', async () => {
    const result = await verifySession('not-a-jwt', SECRET);
    expect(result).toBeNull();
  });

  it('rejects a payload missing isOwner (e.g. a token signed before this field existed)', async () => {
    const { SignJWT } = await import('jose');
    const key = new TextEncoder().encode(SECRET);
    const token = await new SignJWT({ plexId: '123', email: 'a@b.com', username: 'alice' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(key);
    const result = await verifySession(token, SECRET);
    expect(result).toBeNull();
  });
});
