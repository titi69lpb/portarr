import { createPlexProvider, type PlexProviderConfig } from './plex-provider';
import type { MediaServer, PasswordAuth, PinAuth, ProviderId } from './types';

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

export function getPinAuth(config: ProviderConfigSource, id: ProviderId, fetchFn: typeof fetch = fetch): PinAuth {
  const auth = getProvider(config, id, fetchFn).auth;
  if (auth.kind !== 'pin') {
    throw new Error(`Media provider "${id}" does not use pin auth`);
  }
  return auth;
}

export function getPasswordAuth(
  config: ProviderConfigSource,
  id: ProviderId,
  fetchFn: typeof fetch = fetch
): PasswordAuth {
  const auth = getProvider(config, id, fetchFn).auth;
  if (auth.kind !== 'password') {
    throw new Error(`Media provider "${id}" does not use password auth`);
  }
  return auth;
}
