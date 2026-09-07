import { describe, it, expect } from 'vitest';
import { renderNewsletterHtml } from '../../src/lib/newsletter-template';
import type { RecentlyAddedItem } from '../../src/lib/plex';

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

describe('renderNewsletterHtml', () => {
  it('includes the server name and end date', () => {
    const html = renderNewsletterHtml({ movies: [], episodes: [] }, 'My Plex Server', '05/09/2026', 'https://portal.example.com/api/newsletter/poster', 'https://portal.example.com/api/newsletter/unsubscribe?token=abc', 'https://portal.example.com');
    expect(html).toContain('My Plex Server');
    expect(html).toContain('05/09/2026');
  });

  it('renders movie and episode titles', () => {
    const html = renderNewsletterHtml(
      { movies: [item({ title: 'A Movie' })], episodes: [item({ title: 'An Episode', type: 'episode' })] },
      'My Plex Server',
      '05/09/2026',
      'https://portal.example.com/api/newsletter/poster',
      'https://portal.example.com/api/newsletter/unsubscribe?token=abc',
      'https://portal.example.com'
    );
    expect(html).toContain('A Movie');
    expect(html).toContain('An Episode');
  });

  it('escapes HTML in titles', () => {
    const html = renderNewsletterHtml(
      { movies: [item({ title: '<script>alert(1)</script>' })], episodes: [] },
      'My Plex Server',
      '05/09/2026',
      'https://portal.example.com/api/newsletter/poster',
      'https://portal.example.com/api/newsletter/unsubscribe?token=abc',
      'https://portal.example.com'
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('builds poster URLs through the proxy base, with the raw thumb path encoded, never the token-bearing thumbUrl', () => {
    const html = renderNewsletterHtml(
      { movies: [item({ thumbPath: '/library/metadata/1/thumb/1' })], episodes: [] },
      'My Plex Server',
      '05/09/2026',
      'https://portal.example.com/api/newsletter/poster',
      'https://portal.example.com/api/newsletter/unsubscribe?token=abc',
      'https://portal.example.com'
    );
    expect(html).toContain('https://portal.example.com/api/newsletter/poster?path=%2Flibrary%2Fmetadata%2F1%2Fthumb%2F1');
    expect(html).not.toContain('X-Plex-Token');
  });

  it('is wrapped in the shared branded email shell', () => {
    const html = renderNewsletterHtml(
      { movies: [], episodes: [] },
      'My Plex Server',
      '05/09/2026',
      'https://portal.example.com/api/newsletter/poster',
      'https://portal.example.com/api/newsletter/unsubscribe?token=abc',
      'https://portal.example.com'
    );
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Portarr');
    expect(html).toContain('https://portal.example.com/logo.png');
  });

  it('includes a "view in browser" link when an archiveUrl is provided, omits it otherwise', () => {
    const withArchive = renderNewsletterHtml(
      { movies: [], episodes: [] },
      'My Plex Server',
      '05/09/2026',
      'https://portal.example.com/api/newsletter/poster',
      'https://portal.example.com/api/newsletter/unsubscribe?token=abc',
      'https://portal.example.com',
      'https://portal.example.com/api/newsletter/archive/7'
    );
    expect(withArchive).toContain('https://portal.example.com/api/newsletter/archive/7');
    expect(withArchive).toContain('Voir dans le navigateur');

    const withoutArchive = renderNewsletterHtml(
      { movies: [], episodes: [] },
      'My Plex Server',
      '05/09/2026',
      'https://portal.example.com/api/newsletter/poster',
      'https://portal.example.com/api/newsletter/unsubscribe?token=abc',
      'https://portal.example.com'
    );
    expect(withoutArchive).not.toContain('Voir dans le navigateur');
  });

  it('includes the unsubscribe link', () => {
    const html = renderNewsletterHtml(
      { movies: [], episodes: [] },
      'My Plex Server',
      '05/09/2026',
      'https://portal.example.com/api/newsletter/poster',
      'https://portal.example.com/api/newsletter/unsubscribe?token=abc',
      'https://portal.example.com'
    );
    expect(html).toContain('https://portal.example.com/api/newsletter/unsubscribe?token=abc');
  });
});
