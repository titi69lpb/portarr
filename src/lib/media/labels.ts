import type { ProviderId } from './types';

export function providerLabel(provider: ProviderId): string {
  return provider === 'jellyfin' ? 'Jellyfin' : 'Plex';
}
