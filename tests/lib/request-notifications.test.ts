import { describe, it, expect, beforeEach } from 'vitest';
import { getDb, resetDbForTests } from '../../src/lib/db';
import { hasBeenNotified, markNotified } from '../../src/lib/request-notifications';

describe('request-notifications', () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it('is false for a request that has never been notified', () => {
    const db = getDb(':memory:');
    expect(hasBeenNotified(db, 42)).toBe(false);
  });

  it('is true after marking a request as notified', () => {
    const db = getDb(':memory:');
    markNotified(db, 42);
    expect(hasBeenNotified(db, 42)).toBe(true);
  });

  it('marking the same request twice does not throw', () => {
    const db = getDb(':memory:');
    markNotified(db, 42);
    expect(() => markNotified(db, 42)).not.toThrow();
    expect(hasBeenNotified(db, 42)).toBe(true);
  });
});
