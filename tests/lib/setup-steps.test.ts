import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDb, resetDbForTests } from '../../src/lib/db';
import { getSetting } from '../../src/lib/settings';
import { applyServiceSettings } from '../../src/lib/setup-steps';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, statusText: ok ? 'OK' : 'Error', json: async () => body } as Response;
}

describe('applyServiceSettings', () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it('rejects when a required field is missing', async () => {
    const db = getDb(':memory:');
    const result = await applyServiceSettings(db, 'plex', { PLEX_URL: 'https://plex.example.com' }, {}, vi.fn());
    expect(result.ok).toBe(false);
    expect(getSetting(db, 'PLEX_URL')).toBeNull();
  });

  it('runs the connection test and rejects without persisting when it fails', async () => {
    const db = getDb(':memory:');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, false, 401));
    const result = await applyServiceSettings(
      db,
      'plex',
      { PLEX_URL: 'https://plex.example.com', PLEX_SERVER_TOKEN: 'bad', PLEX_SERVER_NAME: 'Srv' },
      {},
      fetchMock
    );
    expect(result.ok).toBe(false);
    expect(getSetting(db, 'PLEX_URL')).toBeNull();
  });

  it('persists every field on a successful test', async () => {
    const db = getDb(':memory:');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ MediaContainer: { machineIdentifier: 'id' } }));
    const result = await applyServiceSettings(
      db,
      'plex',
      { PLEX_URL: 'https://plex.example.com', PLEX_SERVER_TOKEN: 'good', PLEX_SERVER_NAME: 'Srv' },
      {},
      fetchMock
    );
    expect(result).toEqual({ ok: true, error: null });
    expect(getSetting(db, 'PLEX_URL')).toBe('https://plex.example.com');
    expect(getSetting(db, 'PLEX_SERVER_TOKEN')).toBe('good');
    expect(getSetting(db, 'PLEX_SERVER_NAME')).toBe('Srv');
  });

  it('publicBaseUrl skips the connection test entirely', async () => {
    const db = getDb(':memory:');
    const fetchMock = vi.fn();
    const result = await applyServiceSettings(db, 'publicBaseUrl', { PUBLIC_BASE_URL: 'https://portarr.example.com' }, {}, fetchMock);
    expect(result).toEqual({ ok: true, error: null });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getSetting(db, 'PUBLIC_BASE_URL')).toBe('https://portarr.example.com');
  });

  it('a blank submitted field falls back to the existing DB value instead of rejecting — partial re-edit support', async () => {
    const db = getDb(':memory:');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ MediaContainer: { machineIdentifier: 'id' } }));
    await applyServiceSettings(
      db,
      'plex',
      { PLEX_URL: 'https://plex.example.com', PLEX_SERVER_TOKEN: 'good', PLEX_SERVER_NAME: 'Srv' },
      {},
      fetchMock
    );

    const result = await applyServiceSettings(
      db,
      'plex',
      { PLEX_URL: 'https://plex-updated.example.com', PLEX_SERVER_TOKEN: '', PLEX_SERVER_NAME: '' },
      {},
      fetchMock
    );

    expect(result).toEqual({ ok: true, error: null });
    expect(getSetting(db, 'PLEX_URL')).toBe('https://plex-updated.example.com');
    expect(getSetting(db, 'PLEX_SERVER_TOKEN')).toBe('good');
    expect(getSetting(db, 'PLEX_SERVER_NAME')).toBe('Srv');
  });

  it('never overwrites a field that is currently sourced from env, even if submitted', async () => {
    const db = getDb(':memory:');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ MediaContainer: { machineIdentifier: 'id' } }));
    const result = await applyServiceSettings(
      db,
      'plex',
      { PLEX_URL: 'https://attempted-override.example.com', PLEX_SERVER_TOKEN: 'good', PLEX_SERVER_NAME: 'Srv' },
      { PLEX_URL: 'https://from-env.example.com' },
      fetchMock
    );
    expect(result.ok).toBe(true);
    expect(getSetting(db, 'PLEX_URL')).toBeNull();
  });
});
