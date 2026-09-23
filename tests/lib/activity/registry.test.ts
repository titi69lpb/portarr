import { describe, it, expect } from 'vitest';
import { getActivitySources, getActivitySourceFor } from '../../../src/lib/activity/registry';

const TAUTULLI = { url: 'http://tautulli.local', apiKey: 'key' };
const JELLYFIN = { url: 'http://jellyfin.local:8096', apiKey: 'key' };
const JELLYSTAT = { url: 'http://jellystat.local:3000', apiKey: 'js-key' };

describe('getActivitySources', () => {
  it('activates the tautulli source when tautulli is configured', () => {
    expect(getActivitySources({ tautulli: TAUTULLI, jellyfin: null, jellystat: null, jellyfinActivitySource: 'native' as const }).map((s) => s.id)).toEqual(['plex']);
  });

  it('activates nothing when tautulli is missing', () => {
    expect(getActivitySources({ tautulli: null, jellyfin: null, jellystat: null, jellyfinActivitySource: 'native' as const })).toEqual([]);
  });
});

describe('getActivitySourceFor', () => {
  it('returns the source matching the given provider', () => {
    const sources = getActivitySources({ tautulli: TAUTULLI, jellyfin: null, jellystat: null, jellyfinActivitySource: 'native' as const });
    expect(getActivitySourceFor(sources, 'plex')?.id).toBe('plex');
  });

  it('returns null when no source matches', () => {
    const sources = getActivitySources({ tautulli: TAUTULLI, jellyfin: null, jellystat: null, jellyfinActivitySource: 'native' as const });
    expect(getActivitySourceFor(sources, 'jellyfin')).toBeNull();
  });
});

describe('jellyfin activity source selection', () => {
  it('uses the native source when jellystat is not the chosen source', () => {
    const sources = getActivitySources({ tautulli: TAUTULLI, jellyfin: JELLYFIN, jellystat: null, jellyfinActivitySource: 'native' });
    expect(sources.map((s) => s.id)).toEqual(['plex', 'jellyfin']);
  });

  it('uses jellystat when chosen and configured', () => {
    const sources = getActivitySources({ tautulli: TAUTULLI, jellyfin: JELLYFIN, jellystat: JELLYSTAT, jellyfinActivitySource: 'jellystat' });
    expect(sources.map((s) => s.id)).toEqual(['plex', 'jellyfin']);
  });

  it('falls back to native when jellystat is chosen but not configured', () => {
    const sources = getActivitySources({ tautulli: TAUTULLI, jellyfin: JELLYFIN, jellystat: null, jellyfinActivitySource: 'jellystat' });
    expect(sources).toHaveLength(2);
  });

  it('activates nothing for jellyfin when jellyfin itself is not configured', () => {
    const sources = getActivitySources({ tautulli: TAUTULLI, jellyfin: null, jellystat: JELLYSTAT, jellyfinActivitySource: 'jellystat' });
    expect(sources.map((s) => s.id)).toEqual(['plex']);
  });

  it('falls back to native and skips jellystat entirely when jellystat/jellyfinActivitySource are omitted from config', () => {
    const sources = getActivitySources({ tautulli: TAUTULLI, jellyfin: JELLYFIN });
    expect(sources.map((s) => s.id)).toEqual(['plex', 'jellyfin']);
  });
});
