import type { NextRequest } from 'next/server';

// Traefik sits in front of this portal and sets X-Forwarded-For; the first
// entry is the original client. Falls back to a constant when absent (local
// dev, or a request that bypassed the proxy) so callers still get a single
// shared bucket rather than crashing on a missing IP.
export function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  return forwardedFor?.split(',')[0]?.trim() || 'unknown';
}

// Minimal in-memory fixed-window rate limiter. Good enough for a single-
// instance deployment (this portal runs one container, no horizontal
// scaling) — a real multi-instance setup would need a shared store (Redis)
// instead, but that's not this project's situation.
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function resetRateLimitsForTests(): void {
  buckets.clear();
}

export interface RateLimitOptions {
  max: number;
  windowMs: number;
}

// Returns true when the request is allowed, false when the caller has
// exceeded `max` requests within the current `windowMs` window.
export function checkRateLimit(key: string, options: RateLimitOptions): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return true;
  }

  if (bucket.count >= options.max) {
    return false;
  }

  bucket.count += 1;
  return true;
}
