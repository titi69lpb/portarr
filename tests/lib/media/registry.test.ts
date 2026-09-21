import { describe, it, expect } from 'vitest';
import { getActiveProviders, getProvider } from '../../../src/lib/media/registry';

const PLEX = { url: 'http://plex', serverToken: 't', serverName: 'S', clientIdentifier: 'c' };
const TAUTULLI = { url: 'http://tautulli', apiKey: 'k' };

describe('getActiveProviders', () => {
  it('activates plex when plex and tautulli are both configured', () => {
    expect(getActiveProviders({ plex: PLEX, tautulli: TAUTULLI }).map((p) => p.id)).toEqual(['plex']);
  });

  it('activates nothing when plex is missing', () => {
    expect(getActiveProviders({ plex: null, tautulli: TAUTULLI })).toEqual([]);
  });

  it('activates nothing when tautulli is missing (activity still comes from Tautulli)', () => {
    expect(getActiveProviders({ plex: PLEX, tautulli: null })).toEqual([]);
  });
});

describe('getProvider', () => {
  it('returns the requested active provider', () => {
    expect(getProvider({ plex: PLEX, tautulli: TAUTULLI }, 'plex').id).toBe('plex');
  });

  it('throws when the provider is not active', () => {
    expect(() => getProvider({ plex: PLEX, tautulli: TAUTULLI }, 'jellyfin')).toThrow(/jellyfin/);
    expect(() => getProvider({ plex: null, tautulli: null }, 'plex')).toThrow(/plex/);
  });
});
