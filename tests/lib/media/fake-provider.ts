import type { MediaServer, ProviderId } from '../../../src/lib/media/types';

export function fakeProvider(id: ProviderId, overrides: Partial<MediaServer> = {}): MediaServer {
  return {
    id,
    displayName: id,
    auth: {
      kind: 'pin',
      createPin: async () => ({ pinId: 1, authUrl: 'https://example.test/auth' }),
      resolvePin: async () => ({ status: 'pending' }),
    },
    listMembers: async () => [],
    isMember: async () => true,
    recentlyAdded: async () => [],
    recentlyAddedSplit: async () => ({ movies: [], episodes: [] }),
    search: async () => [],
    handlesPoster: () => false,
    poster: async () => null,
    ...overrides,
  };
}
