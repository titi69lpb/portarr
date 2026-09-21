import {
  createPin,
  pollPin,
  getPlexIdentity,
  getSharedUsers,
  isStillSharedUser,
  getRecentlyAdded,
  getRecentlyAddedSplit,
  searchLibrary,
} from './plex';
import { resolvePinToSession, type PollDeps } from './plex-pin';
import type { MediaServer } from './types';

// Structural on purpose (identical to config.ts's PlexConfig): this module is
// reachable from the Edge middleware and must never import config.ts.
export interface PlexProviderConfig {
  url: string;
  serverToken: string;
  serverName: string;
  clientIdentifier: string;
}

export function createPlexProvider(cfg: PlexProviderConfig, fetchFn: typeof fetch = fetch): MediaServer {
  const deps: PollDeps = {
    pollPin: (pinId, clientId) => pollPin(pinId, clientId, fetchFn),
    getPlexIdentity: (userToken, clientId) => getPlexIdentity(userToken, clientId, fetchFn),
    getSharedUsers: (serverToken, serverName) => getSharedUsers(serverToken, serverName, fetchFn),
  };

  return {
    id: 'plex',
    displayName: 'Plex',
    auth: {
      kind: 'pin',
      async createPin() {
        const { pinId, authUrl } = await createPin(cfg.clientIdentifier, fetchFn);
        return { pinId, authUrl };
      },
      resolvePin: (pinId) =>
        resolvePinToSession(pinId, deps, {
          clientIdentifier: cfg.clientIdentifier,
          serverToken: cfg.serverToken,
          serverName: cfg.serverName,
        }),
    },
    listMembers: () => getSharedUsers(cfg.serverToken, cfg.serverName, fetchFn),
    isMember: (userId) => isStillSharedUser(userId, cfg.serverToken, cfg.serverName, fetchFn),
    recentlyAdded: (count) => getRecentlyAdded(cfg.url, cfg.serverToken, count, fetchFn),
    recentlyAddedSplit: (countPerType) => getRecentlyAddedSplit(cfg.url, cfg.serverToken, countPerType, fetchFn),
    search: (query) => searchLibrary(cfg.url, cfg.serverToken, query, fetchFn),
  };
}
