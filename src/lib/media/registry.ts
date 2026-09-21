import { createPlexProvider, type PlexProviderConfig } from './plex-provider';
import type { MediaServer, ProviderId } from './types';

// Only the slices of AppConfig the registry needs, so it stays a plain
// import-free-of-config module (see the Edge runtime constraint).
export interface ProviderConfigSource {
  plex: PlexProviderConfig | null;
  tautulli: object | null;
}

// A provider is active when everything it needs is configured. Plex also
// needs Tautulli, because now-playing/stats/history still come from it.
export function getActiveProviders(config: ProviderConfigSource, fetchFn: typeof fetch = fetch): MediaServer[] {
  const providers: MediaServer[] = [];
  if (config.plex && config.tautulli) {
    providers.push(createPlexProvider(config.plex, fetchFn));
  }
  return providers;
}

export function getProvider(config: ProviderConfigSource, id: ProviderId, fetchFn: typeof fetch = fetch): MediaServer {
  const provider = getActiveProviders(config, fetchFn).find((p) => p.id === id);
  if (!provider) {
    throw new Error(`Media provider "${id}" is not active`);
  }
  return provider;
}
