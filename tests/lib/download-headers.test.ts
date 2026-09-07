import { describe, it, expect } from 'vitest';
import { parseRange, isUnsatisfiableRange, buildContentDispositionHeader } from '../../src/lib/download-headers';

describe('parseRange', () => {
  it('returns null when no Range header is present', () => {
    expect(parseRange(null, 1000)).toBeNull();
    expect(parseRange(undefined, 1000)).toBeNull();
  });

  it('parses a standard bytes=start-end range', () => {
    expect(parseRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 });
  });

  it('parses an open-ended range (bytes=start-) as start to end of file', () => {
    expect(parseRange('bytes=900-', 1000)).toEqual({ start: 900, end: 999 });
  });

  it('parses a suffix range (bytes=-N) as the last N bytes', () => {
    expect(parseRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 });
  });

  it('returns null for a malformed header', () => {
    expect(parseRange('not-a-range', 1000)).toBeNull();
    expect(parseRange('bytes=', 1000)).toBeNull();
  });

  it('returns null when the range is out of bounds', () => {
    expect(parseRange('bytes=2000-3000', 1000)).toBeNull();
    expect(parseRange('bytes=500-100', 1000)).toBeNull();
  });

  it('clamps an over-long end to the last valid byte instead of rejecting', () => {
    expect(parseRange('bytes=0-1999', 1000)).toEqual({ start: 0, end: 999 });
  });
});

describe('isUnsatisfiableRange', () => {
  it('returns true when the start position is beyond the end of the file', () => {
    expect(isUnsatisfiableRange('bytes=2000-3000', 1000)).toBe(true);
  });

  it('returns false when the start is valid, even if the end overshoots (clamp case)', () => {
    expect(isUnsatisfiableRange('bytes=0-1999', 1000)).toBe(false);
  });

  it('returns false when there is no Range header', () => {
    expect(isUnsatisfiableRange(null, 1000)).toBe(false);
  });

  it('returns false for a suffix range', () => {
    expect(isUnsatisfiableRange('bytes=-100', 1000)).toBe(false);
  });
});

describe('buildContentDispositionHeader', () => {
  it('quotes the filename for attachment download', () => {
    expect(buildContentDispositionHeader('installer.bin')).toBe(
      `attachment; filename="installer.bin"; filename*=UTF-8''installer.bin`
    );
  });

  it('percent-encodes the filename* fallback for special characters', () => {
    const header = buildContentDispositionHeader('quickload v3.6 + v3.8.zip');
    expect(header).toContain("filename*=UTF-8''quickload%20v3.6%20%2B%20v3.8.zip");
  });
});
