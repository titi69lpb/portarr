import { statfsSync, type StatsFs } from 'fs';

export interface VolumeStats {
  name: string;
  totalBytes: number;
  freeBytes: number;
}

export interface VolumeConfig {
  name: string;
  path: string;
}

type StatfsFn = (path: string) => StatsFs;

export function getVolumeStats(
  volumes: VolumeConfig[] = [],
  statFn: StatfsFn = statfsSync
): VolumeStats[] {
  return volumes.map((volume) => {
    try {
      const stats = statFn(volume.path);
      return {
        name: volume.name,
        totalBytes: stats.blocks * stats.bsize,
        freeBytes: stats.bavail * stats.bsize,
      };
    } catch (err) {
      console.error(`Failed to stat volume ${volume.name} at ${volume.path}:`, err);
      return { name: volume.name, totalBytes: 0, freeBytes: 0 };
    }
  });
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
