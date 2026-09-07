import { describe, it, expect, beforeEach } from 'vitest';
import { getDb, resetDbForTests } from '../../src/lib/db';
import { isSubscribed, setSubscribed } from '../../src/lib/newsletter-subscriptions';

describe('newsletter-subscriptions', () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it('treats a plex_id with no row as subscribed', () => {
    const db = getDb(':memory:');
    expect(isSubscribed(db, 'unknown-plex-id')).toBe(true);
  });

  it('unsubscribes and subscribes explicitly', () => {
    const db = getDb(':memory:');
    setSubscribed(db, 'plex-1', false);
    expect(isSubscribed(db, 'plex-1')).toBe(false);
    setSubscribed(db, 'plex-1', true);
    expect(isSubscribed(db, 'plex-1')).toBe(true);
  });

  it('setSubscribed is idempotent (upsert, not duplicate rows)', () => {
    const db = getDb(':memory:');
    setSubscribed(db, 'plex-1', false);
    setSubscribed(db, 'plex-1', false);
    const count = db
      .prepare('SELECT COUNT(*) as c FROM newsletter_subscriptions WHERE plex_id = ?')
      .get('plex-1') as { c: number };
    expect(count.c).toBe(1);
  });
});
