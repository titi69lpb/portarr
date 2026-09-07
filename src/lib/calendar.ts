import { timeoutSignal } from './fetch-timeout';
import { withTtlCache, DEFAULT_CACHE_TTL_MS } from './ttl-cache';

export interface CalendarItem {
  title: string;
  releaseDate: string;
  available: boolean;
  kind: 'movie' | 'episode';
  seasonNumber: number | null;
  episodeNumber: number | null;
}

interface SonarrCalendarEntry {
  series: { title: string };
  airDateUtc: string;
  hasFile: boolean;
  seasonNumber: number;
  episodeNumber: number;
}

interface RadarrCalendarEntry {
  title: string;
  physicalRelease?: string;
  digitalRelease?: string;
  hasFile: boolean;
}

function fmt(date: Date): string {
  return date.toISOString().split('T')[0];
}

export async function getUpcomingReleases(
  sonarr: { url: string; apiKey: string },
  radarr: { url: string; apiKey: string },
  start: Date,
  end: Date,
  fetchFn: typeof fetch = fetch
): Promise<CalendarItem[]> {
  const cacheKey = `calendar:${sonarr.url}:${radarr.url}:${fmt(start)}:${fmt(end)}`;
  return withTtlCache(cacheKey, DEFAULT_CACHE_TTL_MS, () =>
    fetchUpcomingReleases(sonarr, radarr, start, end, fetchFn)
  );
}

async function fetchUpcomingReleases(
  sonarr: { url: string; apiKey: string },
  radarr: { url: string; apiKey: string },
  start: Date,
  end: Date,
  fetchFn: typeof fetch
): Promise<CalendarItem[]> {
  const [sonarrRes, radarrRes] = await Promise.all([
    fetchFn(
      `${sonarr.url}/api/v3/calendar?apikey=${sonarr.apiKey}&start=${fmt(start)}&end=${fmt(end)}&includeSeries=true`,
      { signal: timeoutSignal(), cache: 'no-store' }
    ),
    fetchFn(
      `${radarr.url}/api/v3/calendar?apikey=${radarr.apiKey}&start=${fmt(start)}&end=${fmt(end)}`,
      { signal: timeoutSignal(), cache: 'no-store' }
    ),
  ]);

  if (!sonarrRes.ok) {
    throw new Error(`Sonarr API request failed: ${sonarrRes.status} ${sonarrRes.statusText}`);
  }

  if (!radarrRes.ok) {
    throw new Error(`Radarr API request failed: ${radarrRes.status} ${radarrRes.statusText}`);
  }

  const sonarrData = (await sonarrRes.json()) as SonarrCalendarEntry[];
  const radarrData = (await radarrRes.json()) as RadarrCalendarEntry[];

  const episodes: CalendarItem[] = sonarrData.map((e) => ({
    title: e.series.title,
    releaseDate: e.airDateUtc,
    available: e.hasFile,
    kind: 'episode',
    seasonNumber: e.seasonNumber,
    episodeNumber: e.episodeNumber,
  }));

  const movies: CalendarItem[] = radarrData.map((m) => ({
    title: m.title,
    releaseDate: m.physicalRelease ?? m.digitalRelease ?? '',
    available: m.hasFile,
    kind: 'movie',
    seasonNumber: null,
    episodeNumber: null,
  }));

  return [...episodes, ...movies].sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));
}
