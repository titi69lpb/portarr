import { describe, it, expect } from 'vitest';
import { renderEmailShell } from '../../src/lib/email-template';

describe('renderEmailShell', () => {
  it('wraps the body content and includes the branded masthead', () => {
    const html = renderEmailShell('<p>Hello</p>', 'https://portal.example.com', 'fr');
    expect(html).toContain('<p>Hello</p>');
    expect(html).toContain('Portarr');
    expect(html).toContain('https://portal.example.com/logo.png');
  });

  it('uses the portal theme colors', () => {
    const html = renderEmailShell('<p>Hello</p>', 'https://portal.example.com', 'fr');
    expect(html).toContain('#14110F');
    expect(html).toContain('#E2A33B');
  });

  it('is a full HTML document', () => {
    const html = renderEmailShell('<p>Hello</p>', 'https://portal.example.com', 'fr');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
  });

  it('localizes the footer tagline and html lang', () => {
    const fr = renderEmailShell('<p>x</p>', 'https://portal.example.com', 'fr');
    expect(fr).toContain('<html lang="fr">');
    expect(fr).toContain('portail communautaire');
    const en = renderEmailShell('<p>x</p>', 'https://portal.example.com', 'en');
    expect(en).toContain('<html lang="en">');
    expect(en).toContain('community portal');
    expect(en).not.toContain('portail communautaire');
  });
});
