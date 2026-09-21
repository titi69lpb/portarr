import { describe, it, expect } from 'vitest';
import { SignJWT } from 'jose';
import { signUnsubscribeToken, verifyUnsubscribeToken } from '../../src/lib/newsletter-token';

const SECRET = 'test-secret-at-least-32-characters-long';
const KEY = new TextEncoder().encode(SECRET);

describe('newsletter unsubscribe token', () => {
  it('round-trips a valid token', async () => {
    const ref = { provider: 'plex' as const, userId: 'plex-123' };
    const token = await signUnsubscribeToken(ref, SECRET);
    expect(await verifyUnsubscribeToken(token, SECRET)).toEqual(ref);
  });

  it('round-trips a jellyfin token', async () => {
    const ref = { provider: 'jellyfin' as const, userId: 'jf-9' };
    const token = await signUnsubscribeToken(ref, SECRET);
    expect(await verifyUnsubscribeToken(token, SECRET)).toEqual(ref);
  });

  it('still accepts a legacy token ({ plexId }) already sent by email, as plex', async () => {
    const legacy = await new SignJWT({ plexId: 'plex-123' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('90d')
      .sign(KEY);
    expect(await verifyUnsubscribeToken(legacy, SECRET)).toEqual({ provider: 'plex', userId: 'plex-123' });
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signUnsubscribeToken({ provider: 'plex', userId: 'plex-123' }, SECRET);
    expect(await verifyUnsubscribeToken(token, 'a-completely-different-secret-value')).toBeNull();
  });

  it('rejects garbage input', async () => {
    expect(await verifyUnsubscribeToken('not-a-jwt', SECRET)).toBeNull();
  });

  it('rejects an unknown provider', async () => {
    const token = await new SignJWT({ provider: 'emby', userId: '1' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('90d')
      .sign(KEY);
    expect(await verifyUnsubscribeToken(token, SECRET)).toBeNull();
  });

  it('rejects an expired token', async () => {
    const expiredToken = await new SignJWT({ plexId: 'plex-123' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 200 * 24 * 60 * 60)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 100 * 24 * 60 * 60)
      .sign(KEY);
    expect(await verifyUnsubscribeToken(expiredToken, SECRET)).toBeNull();
  });
});
