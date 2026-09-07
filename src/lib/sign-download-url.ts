import { createHmac } from 'crypto';

export const SIGNATURE_TTL_MS = 5 * 60 * 1000;

export function buildSignedDownloadUrl(
  relativePath: string,
  secret: string,
  downloadBaseUrl: string,
  now: number = Date.now()
): string {
  const expires = now + SIGNATURE_TTL_MS;
  const sig = createHmac('sha256', secret).update(`${relativePath}:${expires}`).digest('hex');

  const url = new URL(`${downloadBaseUrl}/download`);
  url.searchParams.set('path', relativePath);
  url.searchParams.set('expires', String(expires));
  url.searchParams.set('sig', sig);
  return url.toString();
}
