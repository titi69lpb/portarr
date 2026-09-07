import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { checkRateLimit, resetRateLimitsForTests, getClientIp } from '../../src/lib/rate-limit';

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
