import { describe, it, expect } from 'vitest';
import { formatFileSize } from '../../src/lib/file-size-formatter';

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
