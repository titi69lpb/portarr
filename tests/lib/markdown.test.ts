import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../../src/lib/markdown';

describe('renderMarkdown', () => {
  it('converts bold text to HTML', () => {
    expect(renderMarkdown('**hello** world')).toContain('<strong>hello</strong>');
  });

  it('converts a heading to HTML', () => {
    expect(renderMarkdown('# Titre')).toContain('<h1>Titre</h1>');
  });

  it('returns an empty string for empty input', () => {
    expect(renderMarkdown('')).toBe('');
  });

  it('strips script tags and inline event handlers from raw HTML input', () => {
    const result = renderMarkdown('<script>alert(1)</script><img src="x" onerror="alert(1)">');
    expect(result).not.toContain('<script');
    expect(result).not.toContain('onerror');
  });
});
