import { describe, it, expect } from 'vitest';
import { RecentlyAdded, buildPosterCards } from '../../src/components/RecentlyAdded';
import type { RecentlyAddedItem } from '../../src/lib/plex';

// buildPosterCards is a plain function (no JSX, no client-only deps like gsap)
// so the security invariant it encodes — every poster src goes through the
// proxy, never a raw Plex URL / exposed X-Plex-Token — stays unit-testable
// without rendering PosterFanCarousel (a 'use client' component with hooks,
// out of scope for this repo's no-jsdom test setup — same convention as
// login/page.tsx and HistoryLoadMore.tsx).

function item(overrides: Partial<RecentlyAddedItem>): RecentlyAddedItem {
  return {
    title: 'Some Title',
    thumbPath: '/library/metadata/1/thumb/1',
    addedAt: new Date().toISOString(),
    type: 'movie',
    plexWebUrl: null,
    ...overrides,
  };
}

describe('buildPosterCards', () => {
  it('routes every poster through the proxy, path-encoded, one card per item', () => {
    const items = [
      item({ title: 'A Movie', thumbPath: '/library/metadata/1/thumb/1' }),
      item({ title: 'An Episode', thumbPath: '/library/metadata/2/thumb/456', type: 'episode' }),
    ];
    const cards = buildPosterCards(items);

    expect(cards).toHaveLength(2);
    expect(cards[0]).toEqual({
      title: 'A Movie',
      imgUrl: '/api/newsletter/poster?path=%2Flibrary%2Fmetadata%2F1%2Fthumb%2F1',
      href: null,
    });
    expect(cards[1]).toEqual({
      title: 'An Episode',
      imgUrl: '/api/newsletter/poster?path=%2Flibrary%2Fmetadata%2F2%2Fthumb%2F456',
      href: null,
    });
  });

  it('carries plexWebUrl through as the card href, unchanged', () => {
    const cards = buildPosterCards([
      item({ title: 'A Movie', plexWebUrl: 'https://plex.example.com/web/index.html#!/server/abc/details?key=%2Flibrary%2Fmetadata%2F1' }),
    ]);
    expect(cards[0].href).toBe('https://plex.example.com/web/index.html#!/server/abc/details?key=%2Flibrary%2Fmetadata%2F1');
  });

  it('never points a card at a direct Plex URL or an exposed X-Plex-Token', () => {
    const cards = buildPosterCards([item({ thumbPath: '/library/metadata/1/thumb/1' })]);

    for (const card of cards) {
      expect(card.imgUrl.startsWith('/api/newsletter/poster?path=')).toBe(true);
      expect(card.imgUrl).not.toContain('X-Plex-Token');
      expect(card.imgUrl).not.toMatch(/^https?:\/\//);
    }
  });

  it('returns an empty array for no items', () => {
    expect(buildPosterCards([])).toEqual([]);
  });
});

describe('RecentlyAdded', () => {
  it('renders nothing when both movies and episodes are empty', () => {
    expect(RecentlyAdded({ movies: [], episodes: [] })).toBeNull();
  });

  it('renders when only movies are present', () => {
    expect(RecentlyAdded({ movies: [item({ title: 'A Movie' })], episodes: [] })).not.toBeNull();
  });

  it('renders when only episodes are present', () => {
    expect(RecentlyAdded({ movies: [], episodes: [item({ title: 'An Episode', type: 'episode' })] })).not.toBeNull();
  });
});
