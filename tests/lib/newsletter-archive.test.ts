import { describe, it, expect, beforeEach } from 'vitest';
import { getDb, resetDbForTests } from '../../src/lib/db';
import { insertNewsletterArchive, getNewsletterArchive } from '../../src/lib/newsletter-archive';

describe('newsletter-archive', () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it('inserts an entry and retrieves it by id', () => {
    const db = getDb(':memory:');
    const entry = insertNewsletterArchive(db, {
      subject: 'Les Nouveautés My Plex Server! (30/08/2026)',
      html: '<html><body>Nouveautés</body></html>',
    });
    expect(entry.id).toBeGreaterThan(0);
    expect(entry.subject).toBe('Les Nouveautés My Plex Server! (30/08/2026)');

    const fetched = getNewsletterArchive(db, entry.id);
    expect(fetched).toEqual(entry);
  });

  it('returns null for an id that does not exist', () => {
    const db = getDb(':memory:');
    expect(getNewsletterArchive(db, 999)).toBeNull();
  });
});
