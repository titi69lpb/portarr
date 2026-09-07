import { describe, it, expect } from 'vitest';
import { renderEmailShell } from '../../src/lib/email-template';

describe('renderEmailShell', () => {
  it('wraps the body content and includes the branded masthead', () => {
    const html = renderEmailShell('<p>Hello</p>', 'https://portal.example.com');
    expect(html).toContain('<p>Hello</p>');
    expect(html).toContain('Portarr');
    expect(html).toContain('https://portal.example.com/logo.png');
  });

  it('uses the portal theme colors', () => {
    const html = renderEmailShell('<p>Hello</p>', 'https://portal.example.com');
    expect(html).toContain('#14110F');
    expect(html).toContain('#E2A33B');
  });

  it('is a full HTML document', () => {
    const html = renderEmailShell('<p>Hello</p>', 'https://portal.example.com');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
  });
});
