import { describe, it, expect } from 'vitest';
import { hashContent } from '../../src/lib/mail-guard';

describe('hashContent', () => {
  it('produces a stable hash for the same input', () => {
    expect(hashContent('Sujet', 'Corps')).toBe(hashContent('Sujet', 'Corps'));
  });

  it('produces a different hash when the subject changes', () => {
    expect(hashContent('Sujet A', 'Corps')).not.toBe(hashContent('Sujet B', 'Corps'));
  });

  it('produces a different hash when the body changes', () => {
    expect(hashContent('Sujet', 'Corps A')).not.toBe(hashContent('Sujet', 'Corps B'));
  });

  it('does not collide when subject/body boundary shifts', () => {
    // Without a separator, ("ab","c") and ("a","bc") would concatenate to the same string.
    expect(hashContent('ab', 'c')).not.toBe(hashContent('a', 'bc'));
  });

  it('returns a 64-character hex string (sha256)', () => {
    expect(hashContent('x', 'y')).toMatch(/^[0-9a-f]{64}$/);
  });
});
