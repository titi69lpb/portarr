import { type StatsFs } from 'fs';
import { statfs as statfsAsync } from 'fs/promises';
import { withTimeout, DEFAULT_FS_TIMEOUT_MS } from './file-explorer';

export interface VolumeStats {
  name: string;
  totalBytes: number;
  freeBytes: number;
}

export interface VolumeConfig {
  name: string;
  path: string;
}

type StatfsFn = (path: string) => Promise<StatsFs>;

// Async + timeout, same pattern as file-explorer.ts (PR#41) — a sync statfsSync
// call here would block the whole Node event loop for every user on a dead NAS
// mount, not just the admin viewing the storage widget.
export async function getVolumeStats(
  volumes: VolumeConfig[] = [],
  timeoutMs: number = DEFAULT_FS_TIMEOUT_MS,
  statFn: StatfsFn = statfsAsync
): Promise<VolumeStats[]> {
  return Promise.all(
    volumes.map(async (volume) => {
      try {
        const stats = await withTimeout(statFn(volume.path), timeoutMs, `statfs(${volume.path})`);
        return {
          name: volume.name,
          totalBytes: stats.blocks * stats.bsize,
          freeBytes: stats.bavail * stats.bsize,
        };
      } catch (err) {
        console.error(`Failed to stat volume ${volume.name} at ${volume.path}:`, err);
        return { name: volume.name, totalBytes: 0, freeBytes: 0 };
      }
    })
  );
}

export function combineVolumeStats(volumes: VolumeStats[]): VolumeStats {
  return volumes.reduce(
    (acc, v) => ({
      name: acc.name,
      totalBytes: acc.totalBytes + v.totalBytes,
      freeBytes: acc.freeBytes + v.freeBytes,
    }),
    { name: 'Cumulé', totalBytes: 0, freeBytes: 0 }
  );
}
