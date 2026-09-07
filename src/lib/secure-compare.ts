import { timingSafeEqual } from 'crypto';

// Constant-time string comparison for long-lived shared secrets (cron/webhook
// headers) exposed on otherwise-unauthenticated routes. A plain `===` leaks
// timing information proportional to the matching prefix length.
export function secureCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
