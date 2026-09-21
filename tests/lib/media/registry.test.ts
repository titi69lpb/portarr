import { describe, it, expect } from 'vitest';
import { getActiveProviders, getProvider, getPinAuth, getPasswordAuth } from '../../../src/lib/media/registry';

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

describe('getPinAuth / getPasswordAuth', () => {
  it('getPinAuth returns the plex pin auth', () => {
    expect(getPinAuth({ plex: PLEX, tautulli: TAUTULLI }, 'plex').kind).toBe('pin');
  });

  it('getPasswordAuth refuses a provider that uses pin auth', () => {
    expect(() => getPasswordAuth({ plex: PLEX, tautulli: TAUTULLI }, 'plex')).toThrow(/does not use password auth/);
  });

  it('both throw when the provider is not active', () => {
    expect(() => getPinAuth({ plex: null, tautulli: null }, 'plex')).toThrow(/not active/);
    expect(() => getPasswordAuth({ plex: PLEX, tautulli: TAUTULLI }, 'jellyfin')).toThrow(/not active/);
  });
});

describe('jellyfin activation', () => {
  const JELLYFIN = { url: 'http://jellyfin.local:8096', apiKey: 'k' };

  it('activates jellyfin next to plex when both are configured', () => {
    expect(getActiveProviders({ plex: PLEX, tautulli: TAUTULLI, jellyfin: JELLYFIN }).map((p) => p.id)).toEqual([
      'plex',
      'jellyfin',
    ]);
  });

  it('activates jellyfin on its own, independently of Tautulli', () => {
    expect(getActiveProviders({ plex: null, tautulli: null, jellyfin: JELLYFIN }).map((p) => p.id)).toEqual(['jellyfin']);
  });

  it('getPasswordAuth returns the jellyfin password auth, getPinAuth refuses it', () => {
    const config = { plex: PLEX, tautulli: TAUTULLI, jellyfin: JELLYFIN };
    expect(getPasswordAuth(config, 'jellyfin').kind).toBe('password');
    expect(() => getPinAuth(config, 'jellyfin')).toThrow(/does not use pin auth/);
  });
});
