import { createJellyfinProvider } from './jellyfin-provider';
import { createPlexProvider } from './plex-provider';
import type { MemberRef } from './types';

// The middleware's entry point for re-checking that a non-owner session is
// still a member of its media server. It runs on the Edge runtime, so it
// only ever reads credentials from env (never config.ts / the DB) and stays
// inside the DB-free import graph enforced by tests/middleware-edge-imports.
//
// Fails open for both providers — an install configured only via the
// DB/wizard has no env credentials here, so revalidation is skipped and the
// 30-day JWT expiry is the fallback (accepted, documented degradation).
export async function isStillMember(
  ref: MemberRef,
  env: Record<string, string | undefined>,
  fetchFn: typeof fetch = fetch
): Promise<boolean> {
  switch (ref.provider) {
    case 'plex': {
      const serverToken = env.PLEX_SERVER_TOKEN;
      const serverName = env.PLEX_SERVER_NAME;
      if (!serverToken || !serverName) return true;
      const plex = createPlexProvider(
        {
          url: env.PLEX_URL ?? '',
          serverToken,
          serverName,
          clientIdentifier: env.PLEX_CLIENT_IDENTIFIER ?? '',
        },
        fetchFn
      );
      return plex.isMember(ref.userId);
    }
    case 'jellyfin': {
      const url = env.JELLYFIN_URL;
      const apiKey = env.JELLYFIN_API_KEY;
      if (!url || !apiKey) return true;
      return createJellyfinProvider({ url: url.replace(/\/+$/, ''), apiKey }, fetchFn).isMember(ref.userId);
    }
  }
}
