import { describe, it, expect, vi } from 'vitest';
import { getVolumeStats, combineVolumeStats, type VolumeConfig } from '../../src/lib/storage';
import type { StatsFs } from 'fs';

function fakeStatsFs(blocks: number, bavail: number, bsize: number = 4096): StatsFs {
  return { blocks, bavail, bsize } as StatsFs;
}

describe('getVolumeStats', () => {
  it('computes total and free bytes from block counts', async () => {
    const volumes: VolumeConfig[] = [{ name: 'Volume-A', path: '/mnt/volume-a' }];
    const statFn = vi.fn().mockResolvedValue(fakeStatsFs(1_000_000, 400_000, 4096));

    const result = await getVolumeStats(volumes, 5000, statFn);

    expect(result).toEqual([
      { name: 'Volume-A', totalBytes: 1_000_000 * 4096, freeBytes: 400_000 * 4096 },
    ]);
  });

  it('reports one entry per configured volume', async () => {
    const volumes: VolumeConfig[] = [
      { name: 'Volume-A', path: '/mnt/volume-a' },
      { name: 'Volume-B', path: '/mnt/volume-b' },
    ];
    const statFn = vi
      .fn()
      .mockResolvedValueOnce(fakeStatsFs(1_000, 400))
      .mockResolvedValueOnce(fakeStatsFs(2_000, 500));

    const result = await getVolumeStats(volumes, 5000, statFn);

    expect(result.map((v) => v.name)).toEqual(['Volume-A', 'Volume-B']);
    expect(statFn).toHaveBeenCalledWith('/mnt/volume-a');
    expect(statFn).toHaveBeenCalledWith('/mnt/volume-b');
  });

  it('returns zeroed stats for a volume that fails to stat, instead of throwing', async () => {
    const volumes: VolumeConfig[] = [{ name: 'Volume-A', path: '/mnt/volume-a' }];
    const statFn = vi.fn().mockRejectedValue(new Error('ENOENT: mount not present'));

    const result = await getVolumeStats(volumes, 5000, statFn);

    expect(result).toEqual([{ name: 'Volume-A', totalBytes: 0, freeBytes: 0 }]);
  });

  it('isolates a single failing volume — one bad mount does not blank out the others', async () => {
    const volumes: VolumeConfig[] = [
      { name: 'Volume-A', path: '/mnt/volume-a' },
      { name: 'Volume-B', path: '/mnt/volume-b' },
    ];
    const statFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('ENOENT'))
      .mockResolvedValueOnce(fakeStatsFs(2_000, 500));

    const result = await getVolumeStats(volumes, 5000, statFn);

    expect(result[0]).toEqual({ name: 'Volume-A', totalBytes: 0, freeBytes: 0 });
    expect(result[1].totalBytes).toBeGreaterThan(0);
  });

  it('returns zeroed stats instead of hanging when a mount is dead (timeout)', async () => {
    const volumes: VolumeConfig[] = [{ name: 'Volume-A', path: '/mnt/volume-a' }];
    const neverSettles = new Promise<StatsFs>(() => {});
    const statFn = vi.fn().mockReturnValue(neverSettles);

    const result = await getVolumeStats(volumes, 50, statFn);

    expect(result).toEqual([{ name: 'Volume-A', totalBytes: 0, freeBytes: 0 }]);
  });

  it('does not let one dead mount delay the others (concurrent, not sequential)', async () => {
    const volumes: VolumeConfig[] = [
      { name: 'Dead', path: '/mnt/dead' },
      { name: 'Alive', path: '/mnt/alive' },
    ];
    const statFn = vi
      .fn()
      .mockImplementationOnce(() => new Promise<StatsFs>(() => {}))
      .mockResolvedValueOnce(fakeStatsFs(2_000, 500));

    const start = Date.now();
    const result = await getVolumeStats(volumes, 50, statFn);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(200);
    expect(result[0]).toEqual({ name: 'Dead', totalBytes: 0, freeBytes: 0 });
    expect(result[1].totalBytes).toBeGreaterThan(0);
  });
});

describe('combineVolumeStats', () => {
  it('sums total and free bytes across volumes', () => {
    const combined = combineVolumeStats([
      { name: 'Volume-A', totalBytes: 5_000, freeBytes: 4_000 },
      { name: 'Volume-B', totalBytes: 11_000, freeBytes: 2_000 },
    ]);
    expect(combined.totalBytes).toBe(16_000);
    expect(combined.freeBytes).toBe(6_000);
  });

  it('returns zero totals for an empty list rather than throwing', () => {
    expect(combineVolumeStats([])).toEqual({ name: 'Cumulé', totalBytes: 0, freeBytes: 0 });
  });
});
