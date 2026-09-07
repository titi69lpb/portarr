import { getRecentlyAdded, type RecentlyAddedItem } from './plex';

export interface NewsletterItems {
  movies: RecentlyAddedItem[];
  episodes: RecentlyAddedItem[];
}

const FETCH_COUNT = 200;

export async function getNewsletterItems(
  plexUrl: string,
  serverToken: string,
  windowDays: number,
  fetchFn: typeof fetch = fetch
): Promise<NewsletterItems> {
  const items = await getRecentlyAdded(plexUrl, serverToken, FETCH_COUNT, fetchFn);
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const withinWindow = items.filter((item) => new Date(item.addedAt).getTime() >= cutoff);
  const withThumb = withinWindow.filter((item) => item.thumbPath && item.thumbPath !== 'undefined');

  return {
    movies: withThumb.filter((item) => item.type === 'movie'),
    episodes: withThumb.filter((item) => item.type === 'episode'),
  };
}
