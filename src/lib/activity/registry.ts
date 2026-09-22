import { createTautulliActivitySource } from './tautulli-source';
import type { ActivitySource } from './types';
import type { ProviderId } from '../media/types';

// Only the slices of AppConfig this registry needs, so it stays decoupled from config.ts
// (matching src/lib/media/registry.ts's ProviderConfigSource pattern).
export interface ActivityConfigSource {
  tautulli: { url: string; apiKey: string } | null;
}

export function getActivitySources(config: ActivityConfigSource, fetchFn: typeof fetch = fetch): ActivitySource[] {
  const sources: ActivitySource[] = [];
  if (config.tautulli) {
    sources.push(createTautulliActivitySource(config.tautulli, fetchFn));
  }
  return sources;
}

export function getActivitySourceFor(sources: ActivitySource[], provider: ProviderId): ActivitySource | null {
  return sources.find((s) => s.id === provider) ?? null;
}
