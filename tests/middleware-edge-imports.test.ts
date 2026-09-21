import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src', import.meta.url));

// Next.js 14 middleware runs on the Edge runtime: it cannot bundle
// better-sqlite3 or touch the filesystem. Everything the middleware imports
// at runtime must therefore stay clear of config.ts / db.ts / node builtins.
const FORBIDDEN_FILES = ['lib/config.ts', 'lib/db.ts'];
const FORBIDDEN_EXTERNALS = ['better-sqlite3', 'fs', 'path', 'os', 'crypto', 'child_process'];

function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(from), spec);
  else return null;
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function walk(entry: string): { files: Set<string>; externals: Set<string> } {
  const files = new Set<string>();
  const externals = new Set<string>();
  const queue = [entry];
  // Runtime imports only: `import type` and `export type` are erased.
  const importRe = /^\s*(?:import|export)\s+(?!type\b)[^;]*?from\s+['"]([^'"]+)['"]/gm;
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (files.has(file)) continue;
    files.add(file);
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(importRe)) {
      const spec = match[1];
      const resolved = resolveImport(file, spec);
      if (resolved) queue.push(resolved);
      else if (!spec.startsWith('.') && !spec.startsWith('@/')) externals.add(spec);
    }
  }
  return { files, externals };
}

describe('middleware Edge import graph', () => {
  const { files, externals } = walk(join(SRC, 'middleware.ts'));

  it('never reaches config.ts or db.ts', () => {
    const reached = [...files].map((f) => relative(SRC, f));
    for (const forbidden of FORBIDDEN_FILES) {
      expect(reached).not.toContain(forbidden);
    }
  });

  it('never imports better-sqlite3 or a node builtin', () => {
    // Prefix match so subpaths (fs/promises, path/posix) are caught, and any
    // node:-prefixed specifier is a builtin whatever its name (worker_threads).
    const offenders = [...externals].filter((spec) => {
      if (spec.startsWith('node:')) return true;
      return FORBIDDEN_EXTERNALS.some((f) => spec === f || spec.startsWith(`${f}/`));
    });
    expect(offenders).toEqual([]);
  });

  it('actually walks the media modules (guards the guard)', () => {
    const reached = [...files].map((f) => relative(SRC, f));
    expect(reached).toContain('lib/session.ts');
    expect(reached).toContain('lib/media/membership.ts');
    expect(reached).toContain('lib/media/jellyfin-provider.ts');
    expect(reached).toContain('lib/media/jellyfin.ts');
  });
});
