import { describe, it, expect } from 'vitest';
import { timeoutSignal, DEFAULT_UPSTREAM_TIMEOUT_MS } from '../../src/lib/fetch-timeout';

describe('timeoutSignal', () => {
  it('returns an AbortSignal', () => {
    expect(timeoutSignal()).toBeInstanceOf(AbortSignal);
  });

  it('is not already aborted immediately after creation', () => {
    expect(timeoutSignal().aborted).toBe(false);
  });

  it('accepts a custom duration', () => {
    expect(timeoutSignal(100)).toBeInstanceOf(AbortSignal);
  });

  it('has a sane default duration', () => {
    expect(DEFAULT_UPSTREAM_TIMEOUT_MS).toBeGreaterThan(0);
    expect(DEFAULT_UPSTREAM_TIMEOUT_MS).toBeLessThanOrEqual(15000);
  });
});
