import { realpath as realpathAsync, readdir as readdirAsync, stat as statAsync } from 'fs/promises';
import { join, relative, sep } from 'path';

export class UnsafePathError extends Error {}

// Thrown when a filesystem operation against a mounted NAS share fails in a way
// that does NOT mean "this path legitimately doesn't exist" — a withTimeout
// timeout (hung/dead mount, e.g. the QNAP share) or any I/O error other than
// ENOENT (EIO, stale handle, etc). Callers should treat this as "the NAS is
// unavailable" (503), never as a 404 — mirrors qnap-dl-proxy's resolve-safe-path.ts.
export class UpstreamUnavailableError extends Error {}

// Node's fs/promises calls still go through the same libuv threadpool as their
// sync counterparts — a timed-out call here doesn't actually cancel the underlying
// OS operation, it just stops THIS request from waiting on it. That's still a real
// improvement over the sync version: other requests keep being served instead of
// the whole process hanging (only enough concurrent hung calls to exhaust the
// threadpool would reproduce the old problem, not a single one).
export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms: ${label}`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

export const DEFAULT_FS_TIMEOUT_MS = 5000;

function classifyFsError(err: unknown, label: string): never {
  if (err instanceof Error && err.message.startsWith('Timed out')) {
    throw new UpstreamUnavailableError(`Timed out: ${label}`);
  }
  if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
    throw new UnsafePathError(`Path does not exist: ${label}`);
  }
  throw new UpstreamUnavailableError(`Filesystem error: ${label}`);
}

export async function resolveSafePath(
  rootPath: string,
  relativePath: string,
  timeoutMs: number = DEFAULT_FS_TIMEOUT_MS
): Promise<string> {
  if (typeof relativePath !== 'string') {
    throw new UnsafePathError(`Invalid path type: expected string, got ${typeof relativePath}`);
  }

  const cleaned = relativePath.replace(/^\/+/, '');
  const candidate = join(rootPath, cleaned);

  let realRoot: string;
  let realCandidate: string;
  try {
    realRoot = await withTimeout(realpathAsync(rootPath), timeoutMs, `realpath(${rootPath})`);
  } catch (err) {
    classifyFsError(err, rootPath);
  }
  try {
    realCandidate = await withTimeout(realpathAsync(candidate), timeoutMs, `realpath(${candidate})`);
  } catch (err) {
    classifyFsError(err, relativePath);
  }

  const rel = relative(realRoot!, realCandidate!);
  if (rel === '..' || rel.startsWith('..' + sep)) {
    throw new UnsafePathError(`Path escapes root: ${relativePath}`);
  }

  return realCandidate!;
}

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  sizeBytes: number;
  modifiedAt: string;
}

export async function listDirectory(
  rootPath: string,
  relativePath: string,
  timeoutMs: number = DEFAULT_FS_TIMEOUT_MS
): Promise<FileEntry[]> {
  const resolved = await resolveSafePath(rootPath, relativePath, timeoutMs);
  const cleanedRelative = (relativePath ?? '').replace(/^\/+|\/+$/g, '');

  let dirents;
  try {
    dirents = await withTimeout(
      readdirAsync(resolved, { withFileTypes: true }),
      timeoutMs,
      `readdir(${resolved})`
    );
  } catch (err) {
    classifyFsError(err, relativePath);
  }

  const entries: FileEntry[] = [];
  await Promise.all(
    dirents!.map(async (dirent) => {
      try {
        const entryPath = cleanedRelative ? `${cleanedRelative}/${dirent.name}` : dirent.name;
        const stats = await withTimeout(
          statAsync(join(resolved, dirent.name)),
          timeoutMs,
          `stat(${dirent.name})`
        );
        entries.push({
          name: dirent.name,
          path: entryPath,
          isDirectory: dirent.isDirectory(),
          sizeBytes: stats.size,
          modifiedAt: stats.mtime.toISOString(),
        });
      } catch (err) {
        // A single entry failing to stat (broken symlink, or a transient hiccup on
        // one file) shouldn't fail the whole listing — same tolerance as the sync
        // version, just also catching the new timeout case per-entry.
        console.error(`Failed to stat ${dirent.name} in ${resolved}:`, err);
      }
    })
  );

  return entries.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });
  });
}

export interface BreadcrumbItem {
  name: string;
  path: string;
}

export function buildBreadcrumb(relativePath: string): BreadcrumbItem[] {
  const cleaned = (relativePath ?? '').replace(/^\/+|\/+$/g, '');
  const items: BreadcrumbItem[] = [{ name: 'Fichiers', path: '' }];
  if (!cleaned) return items;

  let acc = '';
  for (const segment of cleaned.split('/')) {
    acc = acc ? `${acc}/${segment}` : segment;
    items.push({ name: segment, path: acc });
  }
  return items;
}
