import { describe, it, expect } from 'vitest';
import { renderNewsletterHtml } from '../../src/lib/newsletter-template';
import type { RecentlyAddedItem } from '../../src/lib/media/types';

function item(overrides: Partial<RecentlyAddedItem>): RecentlyAddedItem {
  return {
    title: 'Some Title',
    thumbPath: '/library/metadata/1/thumb/1',
    addedAt: new Date().toISOString(),
    type: 'movie',
    webUrl: null,
    ...overrides,
  };
}

describe('renderNewsletterHtml', () => {
  it('includes the server name and end date', () => {
    const html = renderNewsletterHtml({ movies: [], episodes: [] }, 'My Plex Server', '05/09/2026', 'https://portal.example.com/api/newsletter/poster', 'https://portal.example.com/api/newsletter/unsubscribe?token=abc', 'https://portal.example.com', 'fr');
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
      'https://portal.example.com',
      'fr'
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
      'https://portal.example.com',
      'fr'
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
      'https://portal.example.com',
      'fr'
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
      'https://portal.example.com',
      'fr'
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
      'fr',
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
      'https://portal.example.com',
      'fr'
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
      'https://portal.example.com',
      'fr'
    );
    expect(html).toContain('https://portal.example.com/api/newsletter/unsubscribe?token=abc');
  });

  const args = ['My Plex Server', '05/09/2026', 'https://p.example.com/poster', 'https://p.example.com/unsub', 'https://p.example.com'] as const;
  const items = { movies: [item({ title: 'A Movie' })], episodes: [item({ title: 'An Episode', type: 'episode' })] };

  it('renders the English shell for locale en', () => {
    const html = renderNewsletterHtml(items, ...args, 'en', 'https://p.example.com/archive/1');
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('New on My Plex Server!');
    expect(html).toContain('Movies');
    expect(html).toContain('Shows');
    expect(html).toContain('View in browser');
    expect(html).toContain('Unsubscribe from this newsletter');
    expect(html).not.toContain('Voir dans le navigateur');
  });

  it('renders the French shell for locale fr', () => {
    const html = renderNewsletterHtml(items, ...args, 'fr', 'https://p.example.com/archive/1');
    expect(html).toContain('<html lang="fr">');
    expect(html).toContain('Les Nouveautés My Plex Server !');
    expect(html).toContain('Films');
    expect(html).toContain('Séries');
    expect(html).toContain('Se désabonner de cette newsletter');
  });
});
