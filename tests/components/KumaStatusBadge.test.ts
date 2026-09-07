import { describe, it, expect } from 'vitest';
import { KumaStatusBadge } from '../../src/components/KumaStatusBadge';

// Plain Server Component (no hooks), callable directly as a function — same
// convention as RecentlyAdded's empty-state test.

function collectText(node: unknown): string {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(collectText).join('');
  const el = node as { props?: { children?: unknown } };
  if (el.props && 'children' in el.props) return collectText(el.props.children);
  return '';
}

describe('KumaStatusBadge', () => {
  it('renders nothing when status is null', () => {
    expect(KumaStatusBadge({ status: null })).toBeNull();
  });

  it('renders nothing when total is 0', () => {
    expect(KumaStatusBadge({ status: { total: 0, down: 0 } })).toBeNull();
  });

  it('shows "all up" text and no count when nothing is down', () => {
    const element = KumaStatusBadge({ status: { total: 5, down: 0 } });
    const text = collectText(element);
    expect(text).toContain('opérationnels');
    expect(text).not.toMatch(/\d/);
  });

  it('shows the down count (singular) for exactly one down monitor', () => {
    const text = collectText(KumaStatusBadge({ status: { total: 5, down: 1 } }));
    expect(text).toBe('1 service indisponible');
  });

  it('shows the down count (plural) for more than one down monitor', () => {
    const text = collectText(KumaStatusBadge({ status: { total: 5, down: 3 } }));
    expect(text).toBe('3 services indisponibles');
  });

  it('never leaks per-monitor detail — only a plain count, per explicit scope', () => {
    const text = collectText(KumaStatusBadge({ status: { total: 5, down: 2 } }));
    expect(text).not.toMatch(/monitor|http|plex\.bricefeniello/i);
  });
});
