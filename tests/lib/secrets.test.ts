import { describe, it, expect, beforeEach } from 'vitest';
import { getDb, resetDbForTests } from '../../src/lib/db';
import { getSetting } from '../../src/lib/settings';
import { generateSecret, ensureAutoSecret } from '../../src/lib/secrets';

describe('generateSecret', () => {
  it('returns a hex string of the requested byte length', () => {
    const secret = generateSecret(16);
    expect(secret).toMatch(/^[0-9a-f]{32}$/);
  });

  it('returns a different value on each call', () => {
    expect(generateSecret(16)).not.toBe(generateSecret(16));
  });
});

describe('ensureAutoSecret', () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it('returns the env value unchanged when one is provided, without touching the DB', () => {
    const db = getDb(':memory:');
    const result = ensureAutoSecret(db, 'SESSION_SECRET', 'env-provided-secret');
    expect(result).toBe('env-provided-secret');
    expect(getSetting(db, 'SESSION_SECRET')).toBeNull();
  });

  it('generates and persists a secret when env is undefined and none exists in DB', () => {
    const db = getDb(':memory:');
    const result = ensureAutoSecret(db, 'SESSION_SECRET', undefined);
    expect(result).toMatch(/^[0-9a-f]+$/);
    expect(getSetting(db, 'SESSION_SECRET')).toBe(result);
  });

  it('returns the same value on a second call — idempotent across restarts', () => {
    const db = getDb(':memory:');
    const first = ensureAutoSecret(db, 'SESSION_SECRET', undefined);
    const second = ensureAutoSecret(db, 'SESSION_SECRET', undefined);
    expect(second).toBe(first);
  });
});
