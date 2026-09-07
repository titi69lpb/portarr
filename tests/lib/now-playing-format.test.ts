import { describe, it, expect } from 'vitest';
import { formatTimeLeft, calculateProgress } from '../../src/lib/now-playing-format';

describe('formatTimeLeft', () => {
  it('formats minutes only when under an hour remains', () => {
    expect(formatTimeLeft(0, 30 * 60000)).toBe('30m restantes');
  });

  it('formats hours and minutes when over an hour remains', () => {
    expect(formatTimeLeft(0, 90 * 60000)).toBe('1h 30m restantes');
  });

  it('clamps to 0m when already past the end', () => {
    expect(formatTimeLeft(120 * 60000, 90 * 60000)).toBe('0m restantes');
  });

  it('returns a fallback label instead of NaN when duration is 0 (live/unknown-duration session)', () => {
    expect(formatTimeLeft(1000, 0)).toBe('Durée inconnue');
  });

  it('returns a fallback label when duration is not finite', () => {
    expect(formatTimeLeft(1000, NaN)).toBe('Durée inconnue');
  });
});

describe('calculateProgress', () => {
  it('computes a percentage between 0 and 100', () => {
    expect(calculateProgress(45 * 60000, 90 * 60000)).toBe(50);
  });

  it('clamps above 100', () => {
    expect(calculateProgress(200 * 60000, 90 * 60000)).toBe(100);
  });

  it('clamps below 0', () => {
    expect(calculateProgress(-5, 90 * 60000)).toBe(0);
  });

  it('returns 0 instead of NaN when duration is 0', () => {
    expect(calculateProgress(1000, 0)).toBe(0);
  });
});
