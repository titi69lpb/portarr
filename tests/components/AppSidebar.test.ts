import { describe, it, expect } from 'vitest';
import { AppSidebar } from '../../src/components/AppSidebar';
import type { ShortcutConfig } from '../../src/lib/config';

// AppSidebar renders <GlobalSearch /> (a 'use client' component with hooks),
// but JSX only creates an element descriptor for it — the GlobalSearch
// function body never runs unless something actually renders that node. So,
// same convention as KumaStatusBadge.test.ts / RecentlyAdded.test.ts, we can
// call AppSidebar(...) directly and walk the plain element tree it returns,
// with no jsdom / @testing-library/react in this repo's no-jsdom test setup.

type Node = unknown;
interface Element {
  type: unknown;
  props: Record<string, unknown>;
}

function isElement(node: Node): node is Element {
  return typeof node === 'object' && node !== null && 'type' in node && 'props' in node;
}

function collectText(node: Node): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(collectText).join('');
  if (isElement(node)) return collectText(node.props.children);
  return '';
}

function findAll(node: Node, predicate: (el: Element) => boolean, out: Element[] = []): Element[] {
  if (node == null || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') return out;
  if (Array.isArray(node)) {
    for (const child of node) findAll(child, predicate, out);
    return out;
  }
  if (isElement(node)) {
    if (predicate(node)) out.push(node);
    findAll(node.props.children, predicate, out);
  }
  return out;
}

function shortcut(overrides: Partial<ShortcutConfig> = {}): ShortcutConfig {
  return { name: 'Plex', url: 'https://plex.example.com', iconUrl: null, ...overrides };
}

describe('AppSidebar', () => {
  it('renders one link per passed-in shortcut, none when the list is empty', () => {
    const tree = AppSidebar({ shortcuts: [], filesEnabled: true });
    expect(collectText(tree)).not.toContain('Plex');
  });

  it('renders a shortcut link for each entry, using the given name', () => {
    const tree = AppSidebar({ shortcuts: [shortcut()], filesEnabled: true });
    const links = findAll(tree, (el) => el.type === 'a' && collectText(el.props.children).includes('Plex'));
    expect(links).toHaveLength(1);
    expect(links[0].props.href).toBe('https://plex.example.com');
  });

  it('does not render an <img> for a shortcut with a null iconUrl', () => {
    const tree = AppSidebar({ shortcuts: [shortcut({ iconUrl: null })], filesEnabled: true });
    expect(findAll(tree, (el) => el.type === 'img')).toHaveLength(0);
  });

  it('shows the Fichiers link when filesEnabled is true', () => {
    const tree = AppSidebar({ shortcuts: [], filesEnabled: true });
    expect(collectText(tree)).toContain('Fichiers');
  });

  it('hides the Fichiers link when filesEnabled is false', () => {
    const tree = AppSidebar({ shortcuts: [], filesEnabled: false });
    expect(collectText(tree)).not.toContain('Fichiers');
  });
});
