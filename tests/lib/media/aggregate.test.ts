import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  searchAll,
  recentlyAddedAll,
  recentlyAddedSplitAll,
  listMembersAll,
} from '../../../src/lib/media/aggregate';
import type { RecentlyAddedItem } from '../../../src/lib/media/types';
import { fakeProvider } from './fake-provider';

afterEach(() => {
  vi.restoreAllMocks();
});

function item(title: string, addedAt: string, type: RecentlyAddedItem['type'] = 'movie'): RecentlyAddedItem {
  return { title, thumbPath: '/t', addedAt, type, webUrl: null };
}

describe('searchAll', () => {
  it('concatenates results in provider order', async () => {
    const a = fakeProvider('plex', { search: async () => [{ title: 'A', year: 1, type: 'movie', thumbPath: null, webUrl: null }] });
    const b = fakeProvider('jellyfin', { search: async () => [{ title: 'B', year: 2, type: 'show', thumbPath: null, webUrl: null }] });
    expect((await searchAll([a, b], 'x')).map((r) => r.title)).toEqual(['A', 'B']);
  });

  it('returns [] when there are no providers', async () => {
    expect(await searchAll([], 'x')).toEqual([]);
  });
});

describe('recentlyAddedAll', () => {
  it('merges by addedAt descending and slices to count', async () => {
    const a = fakeProvider('plex', { recentlyAdded: async () => [item('old', '2026-01-01T00:00:00.000Z'), item('new', '2026-03-01T00:00:00.000Z')] });
    const b = fakeProvider('jellyfin', { recentlyAdded: async () => [item('mid', '2026-02-01T00:00:00.000Z')] });
    expect((await recentlyAddedAll([a, b], 2)).map((i) => i.title)).toEqual(['new', 'mid']);
  });

  it('asks every provider for the full count', async () => {
    const spy = vi.fn(async () => []);
    await recentlyAddedAll([fakeProvider('plex', { recentlyAdded: spy })], 15);
    expect(spy).toHaveBeenCalledWith(15);
  });
});

describe('recentlyAddedSplitAll', () => {
  it('merges and slices movies and episodes independently', async () => {
    const a = fakeProvider('plex', {
      recentlyAddedSplit: async () => ({
        movies: [item('m-old', '2026-01-01T00:00:00.000Z')],
        episodes: [item('e1', '2026-01-05T00:00:00.000Z', 'episode')],
      }),
    });
    const b = fakeProvider('jellyfin', {
      recentlyAddedSplit: async () => ({
        movies: [item('m-new', '2026-02-01T00:00:00.000Z')],
        episodes: [item('e2', '2026-01-09T00:00:00.000Z', 'episode')],
      }),
    });
    const result = await recentlyAddedSplitAll([a, b], 1);
    expect(result.movies.map((i) => i.title)).toEqual(['m-new']);
    expect(result.episodes.map((i) => i.title)).toEqual(['e2']);
  });
});

describe('listMembersAll', () => {
  it('flattens members from every provider', async () => {
    const a = fakeProvider('plex', { listMembers: async () => [{ provider: 'plex', userId: '1', email: 'a@b.com', username: 'a' }] });
    const b = fakeProvider('jellyfin', { listMembers: async () => [{ provider: 'jellyfin', userId: '1', email: '', username: 'b' }] });
    expect((await listMembersAll([a, b])).map((m) => `${m.provider}:${m.userId}`)).toEqual(['plex:1', 'jellyfin:1']);
  });
});

describe('partial failure', () => {
  it('returns the healthy providers results when one provider fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const ok = fakeProvider('plex', { search: async () => [{ title: 'A', year: 1, type: 'movie', thumbPath: null, webUrl: null }] });
    const bad = fakeProvider('jellyfin', { search: async () => { throw new Error('down'); } });
    expect((await searchAll([ok, bad], 'x')).map((r) => r.title)).toEqual(['A']);
  });

  it('throws the first error when every provider fails, so the route can answer 502 as before', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const bad = fakeProvider('plex', { search: async () => { throw new Error('plex down'); } });
    await expect(searchAll([bad], 'x')).rejects.toThrow('plex down');
  });
});
