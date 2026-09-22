import { describe, it, expect } from 'vitest';
import { getActivitySources, getActivitySourceFor } from '../../../src/lib/activity/registry';

const TAUTULLI = { url: 'http://tautulli.local', apiKey: 'key' };

describe('getActivitySources', () => {
  it('activates the tautulli source when tautulli is configured', () => {
    expect(getActivitySources({ tautulli: TAUTULLI }).map((s) => s.id)).toEqual(['plex']);
  });

  it('activates nothing when tautulli is missing', () => {
    expect(getActivitySources({ tautulli: null })).toEqual([]);
  });
});

describe('getActivitySourceFor', () => {
  it('returns the source matching the given provider', () => {
    const sources = getActivitySources({ tautulli: TAUTULLI });
    expect(getActivitySourceFor(sources, 'plex')?.id).toBe('plex');
  });

  it('returns null when no source matches', () => {
    const sources = getActivitySources({ tautulli: TAUTULLI });
    expect(getActivitySourceFor(sources, 'jellyfin')).toBeNull();
  });
});
