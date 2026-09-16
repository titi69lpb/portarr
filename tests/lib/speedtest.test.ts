import { describe, it, expect } from 'vitest';
import {
  pickNextStageSize,
  medianMs,
  bytesToMbps,
  mbpsToArcFraction,
  mbpsQualityTier,
  MAX_DOWNLOAD_BYTES,
  STAGE_FAST_THRESHOLD_MS,
  GAUGE_MAX_MBPS,
  EXCELLENT_MBPS,
  OK_MBPS,
} from '../../src/lib/speedtest';

describe('pickNextStageSize', () => {
  it('doubles the size when the stage finished faster than the threshold', () => {
    expect(pickNextStageSize(2_000_000, STAGE_FAST_THRESHOLD_MS - 1)).toBe(4_000_000);
  });

  it('returns null when the stage took at least the threshold', () => {
    expect(pickNextStageSize(2_000_000, STAGE_FAST_THRESHOLD_MS)).toBeNull();
  });

  it('returns null when doubling would exceed the max', () => {
    expect(pickNextStageSize(MAX_DOWNLOAD_BYTES, 100, MAX_DOWNLOAD_BYTES)).toBeNull();
    expect(pickNextStageSize(MAX_DOWNLOAD_BYTES - 1, 100, MAX_DOWNLOAD_BYTES)).toBeNull();
  });
});

describe('medianMs', () => {
  it('returns the middle value for an odd-length list', () => {
    expect(medianMs([30, 10, 20])).toBe(20);
  });

  it('averages the two middle values for an even-length list', () => {
    expect(medianMs([10, 20, 30, 40])).toBe(25);
  });

  it('returns the only value for a single-element list', () => {
    expect(medianMs([42])).toBe(42);
  });

  it('returns 0 for an empty list', () => {
    expect(medianMs([])).toBe(0);
  });
});

describe('bytesToMbps', () => {
  it('converts a known transfer to Mbps, rounded to 1 decimal', () => {
    expect(bytesToMbps(12_500_000, 1000)).toBe(100);
  });

  it('returns 0 when elapsed time is not positive', () => {
    expect(bytesToMbps(1000, 0)).toBe(0);
    expect(bytesToMbps(1000, -5)).toBe(0);
  });
});

describe('mbpsToArcFraction', () => {
  it('returns 0 at 0 Mbps', () => {
    expect(mbpsToArcFraction(0)).toBe(0);
  });

  it('returns 1 at the max scale', () => {
    expect(mbpsToArcFraction(GAUGE_MAX_MBPS, GAUGE_MAX_MBPS)).toBeCloseTo(1, 5);
  });

  it('clamps above the max scale instead of exceeding 1', () => {
    expect(mbpsToArcFraction(GAUGE_MAX_MBPS * 10, GAUGE_MAX_MBPS)).toBe(1);
  });

  it('is monotonically increasing (a log scale, not linear)', () => {
    const low = mbpsToArcFraction(10, GAUGE_MAX_MBPS);
    const mid = mbpsToArcFraction(100, GAUGE_MAX_MBPS);
    const high = mbpsToArcFraction(500, GAUGE_MAX_MBPS);
    expect(low).toBeLessThan(mid);
    expect(mid).toBeLessThan(high);
  });
});

describe('mbpsQualityTier', () => {
  it('returns "low" below the ok threshold, including 0 and negative values', () => {
    expect(mbpsQualityTier(0)).toBe('low');
    expect(mbpsQualityTier(-5)).toBe('low');
    expect(mbpsQualityTier(OK_MBPS - 0.1)).toBe('low');
  });

  it('returns "ok" at and above the ok threshold, below excellent', () => {
    expect(mbpsQualityTier(OK_MBPS)).toBe('ok');
    expect(mbpsQualityTier(EXCELLENT_MBPS - 0.1)).toBe('ok');
  });

  it('returns "excellent" at and above the excellent threshold', () => {
    expect(mbpsQualityTier(EXCELLENT_MBPS)).toBe('excellent');
    expect(mbpsQualityTier(EXCELLENT_MBPS * 10)).toBe('excellent');
  });

  it('respects custom thresholds', () => {
    expect(mbpsQualityTier(10, 20, 5)).toBe('ok');
    expect(mbpsQualityTier(4, 20, 5)).toBe('low');
  });
});
