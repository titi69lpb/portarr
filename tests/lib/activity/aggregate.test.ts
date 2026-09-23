import { describe, it, expect, vi, afterEach } from 'vitest';
import { nowPlayingAll, globalStatsAll } from '../../../src/lib/activity/aggregate';
import { EMPTY_GLOBAL_STATS } from '../../../src/lib/activity/types';
import { fakeSource } from './fake-source';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('nowPlayingAll', () => {
  it('merges sessions from every source', async () => {
    const a = fakeSource('plex', { nowPlaying: async () => [{ title: 'A' } as never] });
    const b = fakeSource('jellyfin', { nowPlaying: async () => [{ title: 'B' } as never] });
    const result = await nowPlayingAll([a, b]);
    expect(result.map((s) => (s as { title: string }).title)).toEqual(['A', 'B']);
  });

  it('returns [] for no sources', async () => {
    expect(await nowPlayingAll([])).toEqual([]);
  });

  it('tolerates one failing source and still returns the other', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const ok = fakeSource('plex', { nowPlaying: async () => [{ title: 'A' } as never] });
    const bad = fakeSource('jellyfin', {
      nowPlaying: async () => {
        throw new Error('down');
      },
    });
    expect((await nowPlayingAll([ok, bad])).map((s) => (s as { title: string }).title)).toEqual(['A']);
  });
});

describe('globalStatsAll', () => {
  it('merges and re-ranks a category by value, descending, capped at 10', async () => {
    const a = fakeSource('plex', {
      globalStats: async () => ({
        ...EMPTY_GLOBAL_STATS,
        topMovies: [{ title: 'Low', value: 2 }, { title: 'High', value: 50 }],
      }),
    });
    const b = fakeSource('jellyfin', {
      globalStats: async () => ({ ...EMPTY_GLOBAL_STATS, topMovies: [{ title: 'Mid', value: 10 }] }),
    });
    const result = await globalStatsAll([a, b]);
    expect(result.topMovies.map((s) => s.title)).toEqual(['High', 'Mid', 'Low']);
  });

  it('returns EMPTY_GLOBAL_STATS for no sources', async () => {
    expect(await globalStatsAll([])).toEqual(EMPTY_GLOBAL_STATS);
  });
});
