import { describe, it, expect, beforeEach } from 'vitest';
import { getDb, resetDbForTests } from '../../src/lib/db';
import { getOrCreateSetupToken, verifySetupToken, invalidateSetupToken } from '../../src/lib/setup';

describe('setup token lifecycle', () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it('generates a token on first call', () => {
    const db = getDb(':memory:');
    const token = getOrCreateSetupToken(db);
    expect(token).toMatch(/^[0-9a-f]+$/);
  });

  it('returns the same token on a second call', () => {
    const db = getDb(':memory:');
    const first = getOrCreateSetupToken(db);
    const second = getOrCreateSetupToken(db);
    expect(second).toBe(first);
  });

  it('verifySetupToken is true for the current token', () => {
    const db = getDb(':memory:');
    const token = getOrCreateSetupToken(db);
    expect(verifySetupToken(db, token)).toBe(true);
  });

  it('verifySetupToken is false for a wrong token', () => {
    const db = getDb(':memory:');
    getOrCreateSetupToken(db);
    expect(verifySetupToken(db, 'wrong-token')).toBe(false);
  });

  it('verifySetupToken is false when no token has ever been generated', () => {
    const db = getDb(':memory:');
    expect(verifySetupToken(db, 'anything')).toBe(false);
  });

  it('invalidateSetupToken makes any subsequent verify fail', () => {
    const db = getDb(':memory:');
    const token = getOrCreateSetupToken(db);
    invalidateSetupToken(db);
    expect(verifySetupToken(db, token)).toBe(false);
  });

  it('getOrCreateSetupToken after invalidation generates a fresh, different token', () => {
    const db = getDb(':memory:');
    const first = getOrCreateSetupToken(db);
    invalidateSetupToken(db);
    const second = getOrCreateSetupToken(db);
    expect(second).not.toBe(first);
  });
});
