import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  checkRateLimit,
  resetRateLimitsForTests,
  rateLimitBucketCountForTests,
  getClientIp,
} from '../../src/lib/rate-limit';

describe('checkRateLimit', () => {
  beforeEach(() => {
    resetRateLimitsForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests up to the max within the window', () => {
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit('ip-a', { max: 5, windowMs: 60000 })).toBe(true);
    }
  });

  it('denies the request once max is exceeded within the window', () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit('ip-a', { max: 5, windowMs: 60000 });
    }
    expect(checkRateLimit('ip-a', { max: 5, windowMs: 60000 })).toBe(false);
  });

  it('tracks separate keys independently', () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit('ip-a', { max: 5, windowMs: 60000 });
    }
    expect(checkRateLimit('ip-b', { max: 5, windowMs: 60000 })).toBe(true);
  });

  it('resets the count once the window has elapsed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    for (let i = 0; i < 5; i++) {
      checkRateLimit('ip-a', { max: 5, windowMs: 60000 });
    }
    expect(checkRateLimit('ip-a', { max: 5, windowMs: 60000 })).toBe(false);

    vi.setSystemTime(60001);
    expect(checkRateLimit('ip-a', { max: 5, windowMs: 60000 })).toBe(true);
  });
});

describe('checkRateLimit bucket sweep', () => {
  beforeEach(() => {
    resetRateLimitsForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('evicts expired buckets so attacker-chosen keys cannot grow the map without bound', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    for (let i = 0; i < 10_001; i++) {
      checkRateLimit(`user-${i}`, { max: 5, windowMs: 1000 });
    }
    expect(rateLimitBucketCountForTests()).toBe(10_001);

    vi.setSystemTime(10_000);
    expect(checkRateLimit('fresh-key', { max: 5, windowMs: 1000 })).toBe(true);
    expect(rateLimitBucketCountForTests()).toBeLessThan(100);
  });

  it('keeps live buckets when sweeping', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    for (let i = 0; i < 10_001; i++) {
      checkRateLimit(`user-${i}`, { max: 5, windowMs: 1000 });
    }
    vi.setSystemTime(1_500);
    checkRateLimit('late-key', { max: 1, windowMs: 60_000 });
    vi.setSystemTime(2_500);
    // late-key's window is still open: its single allowed request stays counted
    expect(checkRateLimit('late-key', { max: 1, windowMs: 60_000 })).toBe(false);
  });
});

describe('getClientIp', () => {
  it('returns the first address from X-Forwarded-For', () => {
    const request = new NextRequest('http://localhost/api/auth/login', {
      headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' },
    });
    expect(getClientIp(request)).toBe('203.0.113.5');
  });

  it('falls back to a constant when the header is absent', () => {
    const request = new NextRequest('http://localhost/api/auth/login');
    expect(getClientIp(request)).toBe('unknown');
  });
});
