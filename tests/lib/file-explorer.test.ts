import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  resolveSafePath,
  listDirectory,
  buildBreadcrumb,
  formatFileSize,
  withTimeout,
  UnsafePathError,
  UpstreamUnavailableError,
} from '../../src/lib/file-explorer';

// A sentinel filename whose realpath()/readdir() call never resolves, so the
// internal withTimeout wrapping it can be forced to time out deterministically
// (rather than waiting on a real hung/dead NAS mount). Every other path is
// served by the real fs/promises implementation unchanged.
const HANG_PATH = 'hang-forever';

// A sentinel filename whose realpath() call rejects with a non-ENOENT error (as a
// real stale/dead CIFS mount would surface, e.g. EIO), to prove that error codes
// other than ENOENT are classified as UpstreamUnavailableError, not folded into
// the generic "not found" case.
const IO_ERROR_PATH = 'io-error-forever';

vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>();
  return {
    ...actual,
    realpath: (path: unknown, ...rest: unknown[]) => {
      if (typeof path === 'string' && path.endsWith(HANG_PATH)) {
        return new Promise(() => {});
      }
      if (typeof path === 'string' && path.endsWith(IO_ERROR_PATH)) {
        const err = new Error('simulated I/O error') as NodeJS.ErrnoException;
        err.code = 'EIO';
        return Promise.reject(err);
      }
      return actual.realpath(path as string, ...(rest as []));
    },
    readdir: (path: unknown, ...rest: unknown[]) => {
      if (typeof path === 'string' && path.endsWith('readdir-hang')) {
        return new Promise(() => {});
      }
      return actual.readdir(path as string, ...(rest as []));
    },
  };
});

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'portal-files-test-'));
  mkdirSync(join(root, 'software'));
  writeFileSync(join(root, 'software', 'app.zip'), 'x'.repeat(2048));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('withTimeout', () => {
  it('resolves normally when the promise settles before the timeout', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000, 'test')).resolves.toBe('ok');
  });

  it('rejects with a timeout error when the promise never settles in time', async () => {
    const neverSettles = new Promise(() => {});
    await expect(withTimeout(neverSettles, 50, 'test-label')).rejects.toThrow(/Timed out.*test-label/);
  });
});

describe('resolveSafePath', () => {
  it('resolves a valid nested path under the root', async () => {
    const resolved = await resolveSafePath(root, 'software');
    expect(existsSync(resolved)).toBe(true);
  });

  it('resolves the root itself for an empty relative path', async () => {
    await expect(resolveSafePath(root, '')).resolves.not.toThrow();
  });

  it('rejects a traversal attempt with ..', async () => {
    await expect(resolveSafePath(root, '../etc')).rejects.toThrow(UnsafePathError);
  });

  it('rejects a traversal attempt buried in a longer relative path', async () => {
    await expect(resolveSafePath(root, 'software/../../etc')).rejects.toThrow(UnsafePathError);
  });

  it('rejects an absolute path injected as the relative path', async () => {
    await expect(resolveSafePath(root, '/etc/passwd')).rejects.toThrow(UnsafePathError);
  });

  it('rejects a symlink that points outside the root', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'portal-outside-'));
    writeFileSync(join(outside, 'secret.txt'), 'nope');
    symlinkSync(outside, join(root, 'escape-link'));
    await expect(resolveSafePath(root, 'escape-link')).rejects.toThrow(UnsafePathError);
    rmSync(outside, { recursive: true, force: true });
  });

  it('rejects a path that does not exist with UnsafePathError (genuine ENOENT, not an outage)', async () => {
    await expect(resolveSafePath(root, 'does-not-exist')).rejects.toThrow(UnsafePathError);
  });

  it('rejects a non-string relativePath (array)', async () => {
    await expect(resolveSafePath(root, ['a', 'b'] as any)).rejects.toThrow(UnsafePathError);
  });

  it('rejects a non-string relativePath (object)', async () => {
    await expect(resolveSafePath(root, { path: 'a' } as any)).rejects.toThrow(UnsafePathError);
  });

  it('rejects with UpstreamUnavailableError (not UnsafePathError) when realpath times out', async () => {
    // A hung CIFS/NAS mount looks like a promise that never settles. This must be
    // reported as "the NAS is unavailable", never as the generic 404 case, so a
    // dead QNAP doesn't get misread as a missing folder.
    await expect(resolveSafePath(root, HANG_PATH, 20)).rejects.toThrow(UpstreamUnavailableError);
    await expect(resolveSafePath(root, HANG_PATH, 20)).rejects.not.toBeInstanceOf(UnsafePathError);
  });

  it('rejects with UpstreamUnavailableError when realpath fails with a non-ENOENT error (e.g. EIO)', async () => {
    await expect(resolveSafePath(root, IO_ERROR_PATH, 20)).rejects.toThrow(UpstreamUnavailableError);
    await expect(resolveSafePath(root, IO_ERROR_PATH, 20)).rejects.not.toBeInstanceOf(UnsafePathError);
  });
});

describe('listDirectory', () => {
  it('lists directories before files, alphabetically', async () => {
    mkdirSync(join(root, 'software', 'Windows'));
    writeFileSync(join(root, 'software', 'Windows', 'setup.exe'), 'y'.repeat(10));

    const entries = await listDirectory(root, 'software');

    expect(entries.map((e) => e.name)).toEqual(['Windows', 'app.zip']);
    expect(entries[0].isDirectory).toBe(true);
    expect(entries[1].isDirectory).toBe(false);
  });

  it('reports the correct file size in bytes', async () => {
    const entries = await listDirectory(root, 'software');
    const file = entries.find((e) => e.name === 'app.zip')!;
    expect(file.sizeBytes).toBe(2048);
  });

  it('returns an empty array for an empty directory', async () => {
    mkdirSync(join(root, 'empty'));
    await expect(listDirectory(root, 'empty')).resolves.toEqual([]);
  });

  it('builds POSIX-style relative paths usable as links', async () => {
    mkdirSync(join(root, 'software', 'Windows'));
    const entries = await listDirectory(root, 'software');
    const dir = entries.find((e) => e.name === 'Windows')!;
    expect(dir.path).toBe('software/Windows');
  });

  it('throws UnsafePathError instead of listing when the path escapes the root', async () => {
    await expect(listDirectory(root, '../etc')).rejects.toThrow(UnsafePathError);
  });

  it('skips entries that fail to stat (e.g., broken symlinks)', async () => {
    // Create a broken symlink (points to nonexistent target)
    symlinkSync(join(root, 'nonexistent'), join(root, 'software', 'broken-link'));

    const entries = await listDirectory(root, 'software');

    // Should still list valid entries and omit the broken symlink
    expect(entries.map((e) => e.name)).toEqual(['app.zip']);
    expect(entries).toHaveLength(1);
  });

  it('rejects with UpstreamUnavailableError when readdir itself times out on a dead mount', async () => {
    mkdirSync(join(root, 'readdir-hang'));
    await expect(listDirectory(root, 'readdir-hang', 20)).rejects.toThrow(UpstreamUnavailableError);
  });
});

describe('buildBreadcrumb', () => {
  it('returns just the root item for an empty path', () => {
    expect(buildBreadcrumb('')).toEqual([{ name: 'Fichiers', path: '' }]);
  });

  it('builds one item per segment for a nested path', () => {
    expect(buildBreadcrumb('software/Windows')).toEqual([
      { name: 'Fichiers', path: '' },
      { name: 'software', path: 'software' },
      { name: 'Windows', path: 'software/Windows' },
    ]);
  });
});

describe('formatFileSize', () => {
  it('formats a value under 1024 bytes as a plain byte count', () => {
    expect(formatFileSize(0)).toBe('0 o');
    expect(formatFileSize(500)).toBe('500 o');
  });

  it('formats kilobytes with two decimals', () => {
    expect(formatFileSize(2048)).toBe('2.00 Ko');
  });

  it('formats gigabytes with two decimals, for a multi-GB ISO', () => {
    expect(formatFileSize(4.7 * 1024 ** 3)).toBe('4.70 Go');
  });
});
