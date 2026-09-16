import { describe, it, expect, beforeEach } from 'vitest';
import { getDb, resetDbForTests } from '../../src/lib/db';
import { getSetting, setSetting, deleteSetting } from '../../src/lib/settings';

describe('settings', () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it('returns null for a key that was never set', () => {
    const db = getDb(':memory:');
    expect(getSetting(db, 'PLEX_URL')).toBeNull();
  });

  it('returns the value after setSetting', () => {
    const db = getDb(':memory:');
    setSetting(db, 'PLEX_URL', 'https://plex.example.com');
    expect(getSetting(db, 'PLEX_URL')).toBe('https://plex.example.com');
  });

  it('overwrites an existing value on a second setSetting for the same key', () => {
    const db = getDb(':memory:');
    setSetting(db, 'PLEX_URL', 'https://first.example.com');
    setSetting(db, 'PLEX_URL', 'https://second.example.com');
    expect(getSetting(db, 'PLEX_URL')).toBe('https://second.example.com');
  });

  it('deleteSetting removes the key, later gets return null', () => {
    const db = getDb(':memory:');
    setSetting(db, 'PLEX_URL', 'https://plex.example.com');
    deleteSetting(db, 'PLEX_URL');
    expect(getSetting(db, 'PLEX_URL')).toBeNull();
  });

  it('deleteSetting on a key that was never set does not throw', () => {
    const db = getDb(':memory:');
    expect(() => deleteSetting(db, 'NEVER_SET')).not.toThrow();
  });
});
