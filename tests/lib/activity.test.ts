import { describe, it, expect, vi } from 'vitest';
import { getActiveSessions, ACTIVITY_TIMEOUT_MS } from '../../src/lib/activity';
import { DEFAULT_UPSTREAM_TIMEOUT_MS } from '../../src/lib/fetch-timeout';

function activityResponse(sessions: unknown[]) {
  return { ok: true, json: async () => ({ response: { data: { sessions } } }) } as Response;
}

describe('getActiveSessions', () => {
  it('returns an empty array when nobody is streaming', async () => {
    const fetchMock = vi.fn().mockResolvedValue(activityResponse([]));
    const result = await getActiveSessions('https://tautulli.example.com', 'key', fetchMock);
    expect(result).toEqual([]);
  });

  it('maps a movie session (no season/episode)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      activityResponse([
        {
          title: 'Some Movie',
          grandparent_title: '',
          parent_media_index: '',
          media_index: '',
          year: '2026',
          media_type: 'movie',
          user: 'alice',
          player: "alice's TV",
          bandwidth: '8000',
          transcode_decision: 'direct play',
          view_offset: '600000',
          duration: '7200000',
          state: 'playing',
          thumb: '/library/metadata/1/thumb/1',
          grandparent_thumb: '',
        },
      ])
    );
    const result = await getActiveSessions('https://tautulli.example.com', 'key', fetchMock);
    expect(result).toEqual([
      {
        title: 'Some Movie',
        showTitle: null,
        seasonNumber: null,
        episodeNumber: null,
        year: '2026',
        mediaType: 'movie',
        user: 'alice',
        player: "alice's TV",
        bandwidthKbps: 8000,
        transcodeDecision: 'direct play',
        viewOffsetMs: 600000,
        durationMs: 7200000,
        state: 'playing',
        posterPath: '/library/metadata/1/thumb/1',
      },
    ]);
  });

  it('maps an episode session (uses grandparent title/thumb, includes season/episode)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      activityResponse([
        {
          title: 'Episode Title',
          grandparent_title: 'Some Show',
          parent_media_index: '3',
          media_index: '5',
          year: '2026',
          media_type: 'episode',
          user: 'bob',
          player: 'Chrome',
          bandwidth: '4000',
          transcode_decision: 'transcode',
          view_offset: '100000',
          duration: '1500000',
          state: 'paused',
          thumb: '/library/metadata/2/thumb/2',
          grandparent_thumb: '/library/metadata/3/thumb/3',
        },
      ])
    );
    const result = await getActiveSessions('https://tautulli.example.com', 'key', fetchMock);
    expect(result).toEqual([
      {
        title: 'Some Show',
        showTitle: 'Episode Title',
        seasonNumber: 3,
        episodeNumber: 5,
        year: '2026',
        mediaType: 'episode',
        user: 'bob',
        player: 'Chrome',
        bandwidthKbps: 4000,
        transcodeDecision: 'transcode',
        viewOffsetMs: 100000,
        durationMs: 1500000,
        state: 'paused',
        posterPath: '/library/metadata/3/thumb/3',
      },
    ]);
  });

  it('throws when the Tautulli API returns an error status', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Error' } as Response);
    await expect(
      getActiveSessions('https://tautulli.example.com', 'key', fetchMock)
    ).rejects.toThrow('Tautulli API request failed: 500 Error');
  });

  it('gives get_activity more time than the shared 5s default — it live-proxies to Plex, unlike Tautulli\'s other DB-backed endpoints', () => {
    expect(ACTIVITY_TIMEOUT_MS).toBeGreaterThan(DEFAULT_UPSTREAM_TIMEOUT_MS);
  });
});
