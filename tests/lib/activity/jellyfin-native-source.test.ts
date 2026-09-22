import { describe, it, expect, vi } from 'vitest';
import { createJellyfinNativeActivitySource } from '../../../src/lib/activity/jellyfin-native-source';
import { EMPTY_GLOBAL_STATS } from '../../../src/lib/activity/types';

const CFG = { url: 'http://jellyfin.local:8096', apiKey: 'key' };
const MEMBER = { provider: 'jellyfin' as const, userId: 'a'.repeat(32), email: '', username: 'alice' };

function res(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

describe('createJellyfinNativeActivitySource', () => {
  it('identifies itself as the jellyfin source', () => {
    expect(createJellyfinNativeActivitySource(CFG, vi.fn()).id).toBe('jellyfin');
  });

  it('maps a real playing session to ActiveSession (movie)', async () => {
    const fetchFn = vi.fn(async () =>
      res([
        {
          UserName: 'alice',
          DeviceName: 'Living Room TV',
          NowPlayingItem: { Id: 'a'.repeat(32), Name: 'Some Movie', Type: 'Movie', ProductionYear: 2024, RunTimeTicks: 72000000000 },
          PlayState: { IsPaused: false, PositionTicks: 6000000000, PlayMethod: 'DirectPlay' },
        },
      ])
    ) as unknown as typeof fetch;
    const source = createJellyfinNativeActivitySource(CFG, fetchFn);
    expect(await source.nowPlaying()).toEqual([
      {
        title: 'Some Movie',
        showTitle: null,
        seasonNumber: null,
        episodeNumber: null,
        year: '2024',
        mediaType: 'movie',
        user: 'alice',
        player: 'Living Room TV',
        bandwidthKbps: 0,
        transcodeDecision: 'direct play',
        viewOffsetMs: 600000,
        durationMs: 7200000,
        state: 'playing',
        posterPath: `jellyfin:${'a'.repeat(32)}`,
      },
    ]);
  });

  it('maps an episode session, using the season id for the poster and title/showTitle split', async () => {
    const fetchFn = vi.fn(async () =>
      res([
        {
          UserName: 'bob',
          DeviceName: 'Chrome',
          NowPlayingItem: { Id: 'b'.repeat(32), Name: 'Episode Title', Type: 'Episode', SeriesName: 'Some Show', SeasonId: 'c'.repeat(32), ParentIndexNumber: 2, IndexNumber: 5, RunTimeTicks: 18000000000 },
          PlayState: { IsPaused: true, PositionTicks: 1000000000, PlayMethod: 'Transcode' },
          TranscodingInfo: { Bitrate: 4000000 },
        },
      ])
    ) as unknown as typeof fetch;
    const source = createJellyfinNativeActivitySource(CFG, fetchFn);
    const [session] = await source.nowPlaying();
    expect(session).toMatchObject({
      title: 'Some Show',
      showTitle: 'Episode Title',
      seasonNumber: 2,
      episodeNumber: 5,
      year: '',
      mediaType: 'episode',
      user: 'bob',
      state: 'paused',
      transcodeDecision: 'transcode',
      bandwidthKbps: 4000,
      posterPath: `jellyfin:${'c'.repeat(32)}`,
    });
  });

  it('every other method returns empty/null — deliberate degradation of the native source', async () => {
    const source = createJellyfinNativeActivitySource(CFG, vi.fn());
    expect(await source.lastSeen(MEMBER)).toBeNull();
    expect(await source.personalStats(MEMBER)).toBeNull();
    expect(await source.personalStatsByType(MEMBER)).toEqual({ movies: { count: 0, hours: 0 }, episodes: { count: 0, hours: 0 } });
    expect(await source.recentHistory(MEMBER, 8)).toEqual([]);
    expect(await source.historyPage(MEMBER, 0, 30)).toEqual({ items: [], total: 0 });
    expect(await source.globalStats()).toEqual(EMPTY_GLOBAL_STATS);
  });
});
