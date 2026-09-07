import { describe, it, expect } from 'vitest';
import { secureCompare } from '../../src/lib/secure-compare';

describe('secureCompare', () => {
  it('returns true for identical strings', () => {
    expect(secureCompare('abc123', 'abc123')).toBe(true);
  });

  it('returns false for different strings of the same length', () => {
    expect(secureCompare('abc123', 'abc124')).toBe(false);
  });

  it('returns false for strings of different lengths without throwing', () => {
    expect(secureCompare('short', 'a-much-longer-string')).toBe(false);
  });

  it('returns false for an empty candidate against a non-empty secret', () => {
    expect(secureCompare('', 'secret')).toBe(false);
  });
});
