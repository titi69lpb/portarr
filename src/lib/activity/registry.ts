import { createTautulliActivitySource } from './tautulli-source';
import { createJellyfinNativeActivitySource } from './jellyfin-native-source';
import { createJellystatActivitySource } from './jellystat-source';
import type { JellystatConfig } from './jellystat';
import type { JellyfinProviderConfig } from '../media/jellyfin';
import type { ActivitySource } from './types';
import type { ProviderId } from '../media/types';

// Only the slices of AppConfig this registry needs, so it stays decoupled from config.ts
// (matching src/lib/media/registry.ts's ProviderConfigSource pattern).
//
// jellystat/jellyfinActivitySource are optional rather than required: config.ts's
// AppConfig/ConfiguredAppConfig doesn't carry those fields yet (added by a later
// task), and every existing call site passes the real config object straight
// through — making them required would break those call sites' typecheck before
// that task lands. getActivitySources below defaults a missing
// jellyfinActivitySource to 'native' and treats a missing jellystat as null.
export interface ActivityConfigSource {
  tautulli: { url: string; apiKey: string } | null;
  jellyfin: JellyfinProviderConfig | null;
  jellystat?: JellystatConfig | null;
  jellyfinActivitySource?: 'jellystat' | 'native';
}

export function getActivitySources(config: ActivityConfigSource, fetchFn: typeof fetch = fetch): ActivitySource[] {
  const sources: ActivitySource[] = [];
  if (config.tautulli) {
    sources.push(createTautulliActivitySource(config.tautulli, fetchFn));
  }
  if (config.jellyfin) {
    if ((config.jellyfinActivitySource ?? 'native') === 'jellystat' && config.jellystat) {
      sources.push(createJellystatActivitySource(config.jellystat, fetchFn));
    } else {
      sources.push(createJellyfinNativeActivitySource(config.jellyfin, fetchFn));
    }
  }
  return sources;
}

export function getActivitySourceFor(sources: ActivitySource[], provider: ProviderId): ActivitySource | null {
  return sources.find((s) => s.id === provider) ?? null;
}
