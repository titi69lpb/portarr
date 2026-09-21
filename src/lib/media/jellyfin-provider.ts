import { DEFAULT_CACHE_TTL_MS, withTtlCache } from '../ttl-cache';
import {
  authenticateByName,
  fetchJellyfinPoster,
  getRecentItems,
  jellyfinPosterRef,
  jellyfinWebUrl,
  listUsers,
  logoutSession,
  parseJellyfinPosterRef,
  searchItems,
  type JellyfinItem,
  type JellyfinProviderConfig,
  type JellyfinUser,
} from './jellyfin';
import { SESSION_REVALIDATION_TTL_MS } from './plex';
import type {
  MediaMember,
  MediaServer,
  RecentlyAddedItem,
  RecentlyAddedSplit,
  SearchResultItem,
} from './types';

const normalizeId = (id: string) => id.toLowerCase().replace(/-/g, '');

const toMember = (u: JellyfinUser): MediaMember => ({
  provider: 'jellyfin',
  userId: u.id,
  email: '',
  username: u.name,
});

export function createJellyfinProvider(cfg: JellyfinProviderConfig, fetchFn: typeof fetch = fetch): MediaServer {
  const link = (id: string, serverId: string | null) => jellyfinWebUrl(cfg.url, id, serverId);

  const toMovie = (item: JellyfinItem): RecentlyAddedItem | null =>
    item.dateCreated
      ? {
          title: item.name,
          thumbPath: item.hasPrimaryImage ? jellyfinPosterRef(item.id) : '',
          addedAt: item.dateCreated,
          type: 'movie',
          webUrl: link(item.id, item.serverId),
        }
      : null;

  // Episode rows show the season poster (like the Plex rows do), then the
  // series poster, then the episode's own still.
  const episodePoster = (item: JellyfinItem): string => {
    if (item.parentPrimaryImageItemId) return jellyfinPosterRef(item.parentPrimaryImageItemId);
    if (item.seriesId && item.hasSeriesPrimaryImage) return jellyfinPosterRef(item.seriesId);
    return item.hasPrimaryImage ? jellyfinPosterRef(item.id) : '';
  };

  const toEpisode = (item: JellyfinItem): RecentlyAddedItem | null =>
    item.dateCreated
      ? {
          title: item.seriesName ?? item.name,
          thumbPath: episodePoster(item),
          addedAt: item.dateCreated,
          type: 'episode',
          webUrl: link(item.seasonId ?? item.seriesId ?? item.id, item.serverId),
        }
      : null;

  // Jellyfin lists every episode on its own: a season that just landed would
  // fill the whole row. Keep only the newest episode per series, like Plex's
  // grouping of new episodes. Input is already newest-first.
  const collapseBySeries = (episodes: JellyfinItem[]): JellyfinItem[] => {
    const seen = new Set<string>();
    return episodes.filter((item) => {
      const key = item.seriesId ?? item.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const present = <T,>(value: T | null): value is T => value !== null;

  function recentlyAddedSplit(countPerType: number): Promise<RecentlyAddedSplit> {
    return withTtlCache(`jellyfin-recently-added-split:${cfg.url}:${countPerType}`, DEFAULT_CACHE_TTL_MS, async () => {
      // Two requests (like the two Plex hubs) so a burst of episodes cannot
      // starve the movies list; the raw batch leaves room for the collapsing.
      const raw = Math.max(countPerType * 3, 50);
      const [movies, episodes] = await Promise.all([
        getRecentItems(cfg, 'Movie', raw, fetchFn),
        getRecentItems(cfg, 'Episode', raw, fetchFn),
      ]);
      return {
        movies: movies.map(toMovie).filter(present).slice(0, countPerType),
        episodes: collapseBySeries(episodes).map(toEpisode).filter(present).slice(0, countPerType),
      };
    });
  }

  return {
    id: 'jellyfin',
    displayName: 'Jellyfin',
    auth: {
      kind: 'password',
      async authenticate(username, password) {
        const result = await authenticateByName(cfg, username, password, fetchFn);
        if (result.status === 'denied') return { status: 'denied' };
        // The token only proves the credentials: end that Jellyfin session
        // right away so Portarr never leaves one behind.
        try {
          await logoutSession(cfg, result.accessToken, fetchFn);
        } catch (err) {
          console.error('Failed to end the temporary Jellyfin session:', err instanceof Error ? err.message : 'unknown error');
        }
        if (result.user.isDisabled) return { status: 'denied' };
        return { status: 'ok', user: toMember(result.user), isOwner: result.user.isAdministrator };
      },
    },
    async listMembers() {
      return (await listUsers(cfg, fetchFn)).filter((u) => !u.isDisabled).map(toMember);
    },
    async isMember(userId) {
      try {
        const users = await withTtlCache(`jellyfin-users:${cfg.url}`, SESSION_REVALIDATION_TTL_MS, () =>
          listUsers(cfg, fetchFn)
        );
        return users.some((u) => !u.isDisabled && normalizeId(u.id) === normalizeId(userId));
      } catch (err) {
        console.error('Failed to re-verify Jellyfin user, allowing session through:', err);
        return true;
      }
    },
    async recentlyAdded(count) {
      const split = await recentlyAddedSplit(count);
      return [...split.movies, ...split.episodes]
        .sort((a, b) => Date.parse(b.addedAt) - Date.parse(a.addedAt))
        .slice(0, count);
    },
    recentlyAddedSplit,
    async search(query) {
      const trimmed = query.trim();
      if (!trimmed) return [];
      const items = await searchItems(cfg, trimmed, 10, fetchFn);
      return items.map(
        (item): SearchResultItem => ({
          title: item.name,
          year: item.productionYear,
          type: item.type === 'Series' ? 'show' : 'movie',
          thumbPath: item.hasPrimaryImage ? jellyfinPosterRef(item.id) : null,
          webUrl: link(item.id, item.serverId),
        })
      );
    },
    handlesPoster: (ref) => parseJellyfinPosterRef(ref) !== null,
    async poster(ref) {
      const id = parseJellyfinPosterRef(ref);
      return id ? fetchJellyfinPoster(cfg, id, fetchFn) : null;
    },
  };
}
