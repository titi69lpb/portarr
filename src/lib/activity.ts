import { timeoutSignal } from './fetch-timeout';

// get_activity is structurally different from Tautulli's other endpoints:
// those read Tautulli's own local DB (fast, ms-scale), but get_activity has
// to live-proxy to Plex's own /status/sessions in real time. Over this
// infra's WireGuard tunnels, that round-trip can plausibly run past the
// shared 5s default under real load — which silently turned "Now Playing"
// into an always-empty state (a 502 the dashboard swallows) rather than a
// visible error. Give this one endpoint more room.
export const ACTIVITY_TIMEOUT_MS = 12000;

export interface ActiveSession {
  title: string;
  showTitle: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  year: string;
  mediaType: 'movie' | 'episode' | 'track' | 'other';
  user: string;
  player: string;
  bandwidthKbps: number;
  transcodeDecision: 'direct play' | 'copy' | 'transcode';
  viewOffsetMs: number;
  durationMs: number;
  state: 'playing' | 'paused' | 'buffering';
  posterPath: string;
}

interface TautulliSession {
  title: string;
  grandparent_title: string;
  parent_media_index: string;
  media_index: string;
  year: string;
  media_type: string;
  user: string;
  player: string;
  bandwidth: string;
  transcode_decision: string;
  view_offset: string;
  duration: string;
  state: string;
  thumb: string;
  grandparent_thumb: string;
}

export async function getActiveSessions(
  tautulliUrl: string,
  apiKey: string,
  fetchFn: typeof fetch = fetch
): Promise<ActiveSession[]> {
  const res = await fetchFn(`${tautulliUrl}/api/v2?apikey=${apiKey}&cmd=get_activity`, {
    signal: timeoutSignal(ACTIVITY_TIMEOUT_MS),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Tautulli API request failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { response: { data: { sessions: TautulliSession[] } } };

  return data.response.data.sessions.map((s) => {
    const isEpisode = s.media_type === 'episode' && s.grandparent_title !== '';
    return {
      title: isEpisode ? s.grandparent_title : s.title,
      showTitle: isEpisode ? s.title : null,
      seasonNumber: isEpisode ? Number(s.parent_media_index) : null,
      episodeNumber: isEpisode ? Number(s.media_index) : null,
      year: s.year,
      mediaType: (['movie', 'episode', 'track'].includes(s.media_type)
        ? s.media_type
        : 'other') as ActiveSession['mediaType'],
      user: s.user,
      player: s.player,
      bandwidthKbps: Number(s.bandwidth),
      transcodeDecision: s.transcode_decision as ActiveSession['transcodeDecision'],
      viewOffsetMs: Number(s.view_offset),
      durationMs: Number(s.duration),
      state: s.state as ActiveSession['state'],
      posterPath: isEpisode ? s.grandparent_thumb : s.thumb,
    };
  });
}
