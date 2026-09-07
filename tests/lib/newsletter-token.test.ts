import { describe, it, expect } from 'vitest';
import { SignJWT } from 'jose';
import { signUnsubscribeToken, verifyUnsubscribeToken } from '../../src/lib/newsletter-token';

const SECRET = 'test-secret-at-least-32-characters-long';

describe('newsletter unsubscribe token', () => {
  it('round-trips a valid token', async () => {
    const token = await signUnsubscribeToken('plex-123', SECRET);
    const result = await verifyUnsubscribeToken(token, SECRET);
    expect(result).toBe('plex-123');
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signUnsubscribeToken('plex-123', SECRET);
    const result = await verifyUnsubscribeToken(token, 'a-completely-different-secret-value');
    expect(result).toBeNull();
  });

  it('rejects garbage input', async () => {
    const result = await verifyUnsubscribeToken('not-a-jwt', SECRET);
    expect(result).toBeNull();
  });

  it('rejects an expired token', async () => {
    const key = new TextEncoder().encode(SECRET);
    const expiredToken = await new SignJWT({ plexId: 'plex-123' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 200 * 24 * 60 * 60)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 100 * 24 * 60 * 60)
      .sign(key);
    const result = await verifyUnsubscribeToken(expiredToken, SECRET);
    expect(result).toBeNull();
  });
});
