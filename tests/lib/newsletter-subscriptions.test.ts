import { describe, it, expect, beforeEach } from 'vitest';
import { getDb, resetDbForTests } from '../../src/lib/db';
import { isSubscribed, setSubscribed } from '../../src/lib/newsletter-subscriptions';

describe('newsletter-subscriptions', () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it('treats a member with no row as subscribed', () => {
    const db = getDb(':memory:');
    expect(isSubscribed(db, { provider: 'plex', userId: 'unknown-plex-id' })).toBe(true);
  });

  it('unsubscribes and subscribes explicitly', () => {
    const db = getDb(':memory:');
    setSubscribed(db, { provider: 'plex', userId: 'plex-1' }, false);
    expect(isSubscribed(db, { provider: 'plex', userId: 'plex-1' })).toBe(false);
    setSubscribed(db, { provider: 'plex', userId: 'plex-1' }, true);
    expect(isSubscribed(db, { provider: 'plex', userId: 'plex-1' })).toBe(true);
  });

  it('setSubscribed is idempotent (upsert, not duplicate rows)', () => {
    const db = getDb(':memory:');
    setSubscribed(db, { provider: 'plex', userId: 'plex-1' }, false);
    setSubscribed(db, { provider: 'plex', userId: 'plex-1' }, false);
    const count = db
      .prepare("SELECT COUNT(*) as c FROM newsletter_subscriptions WHERE provider = 'plex' AND external_id = ?")
      .get('plex-1') as { c: number };
    expect(count.c).toBe(1);
  });

  it('keeps subscriptions of two providers with the same id independent', () => {
    const db = getDb(':memory:');
    setSubscribed(db, { provider: 'plex', userId: '7' }, false);
    expect(isSubscribed(db, { provider: 'plex', userId: '7' })).toBe(false);
    expect(isSubscribed(db, { provider: 'jellyfin', userId: '7' })).toBe(true);
  });
});
