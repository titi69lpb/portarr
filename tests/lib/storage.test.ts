import { describe, it, expect, vi } from 'vitest';
import { getVolumeStats, combineVolumeStats, type VolumeConfig } from '../../src/lib/storage';
import type { StatsFs } from 'fs';

function fakeStatsFs(blocks: number, bavail: number, bsize: number = 4096): StatsFs {
  return { blocks, bavail, bsize } as StatsFs;
}

describe('getVolumeStats', () => {
  it('computes total and free bytes from block counts', () => {
    const volumes: VolumeConfig[] = [{ name: 'Cube-SYNO', path: '/mnt/cube-syno' }];
    const statFn = vi.fn().mockReturnValue(fakeStatsFs(1_000_000, 400_000, 4096));

    const result = getVolumeStats(volumes, statFn);

    expect(result).toEqual([
      { name: 'Cube-SYNO', totalBytes: 1_000_000 * 4096, freeBytes: 400_000 * 4096 },
    ]);
  });

  it('reports one entry per configured volume', () => {
    const volumes: VolumeConfig[] = [
      { name: 'Cube-SYNO', path: '/mnt/cube-syno' },
      { name: 'TFS-SYNO', path: '/mnt/tfs-syno' },
    ];
    const statFn = vi
      .fn()
      .mockReturnValueOnce(fakeStatsFs(1_000, 400))
      .mockReturnValueOnce(fakeStatsFs(2_000, 500));

    const result = getVolumeStats(volumes, statFn);

    expect(result.map((v) => v.name)).toEqual(['Cube-SYNO', 'TFS-SYNO']);
    expect(statFn).toHaveBeenCalledWith('/mnt/cube-syno');
    expect(statFn).toHaveBeenCalledWith('/mnt/tfs-syno');
  });

  it('returns zeroed stats for a volume that fails to stat, instead of throwing', () => {
    const volumes: VolumeConfig[] = [{ name: 'Cube-SYNO', path: '/mnt/cube-syno' }];
    const statFn = vi.fn().mockImplementation(() => {
      throw new Error('ENOENT: mount not present');
    });

    const result = getVolumeStats(volumes, statFn);

    expect(result).toEqual([{ name: 'Cube-SYNO', totalBytes: 0, freeBytes: 0 }]);
  });

  it('isolates a single failing volume — one bad mount does not blank out the others', () => {
    const volumes: VolumeConfig[] = [
      { name: 'Cube-SYNO', path: '/mnt/cube-syno' },
      { name: 'TFS-SYNO', path: '/mnt/tfs-syno' },
    ];
    const statFn = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('ENOENT');
      })
      .mockReturnValueOnce(fakeStatsFs(2_000, 500));

    const result = getVolumeStats(volumes, statFn);

    expect(result[0]).toEqual({ name: 'Cube-SYNO', totalBytes: 0, freeBytes: 0 });
    expect(result[1].totalBytes).toBeGreaterThan(0);
  });
});

describe('combineVolumeStats', () => {
  it('sums total and free bytes across volumes', () => {
    const combined = combineVolumeStats([
      { name: 'Cube-SYNO', totalBytes: 5_000, freeBytes: 4_000 },
      { name: 'TFS-SYNO', totalBytes: 11_000, freeBytes: 2_000 },
    ]);
    expect(combined.totalBytes).toBe(16_000);
    expect(combined.freeBytes).toBe(6_000);
  });

  it('returns zero totals for an empty list rather than throwing', () => {
    expect(combineVolumeStats([])).toEqual({ name: 'Cumulé', totalBytes: 0, freeBytes: 0 });
  });
});
