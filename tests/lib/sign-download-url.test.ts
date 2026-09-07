import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import { buildSignedDownloadUrl, SIGNATURE_TTL_MS } from '../../src/lib/sign-download-url';

const BASE_URL = 'https://dl.example.com';

describe('buildSignedDownloadUrl', () => {
  it('builds a URL pointing at the given base URL with the /download path', () => {
    const url = buildSignedDownloadUrl('Games/foo.iso', 'test-secret', BASE_URL, 1000);
    expect(url.startsWith(`${BASE_URL}/download?`)).toBe(true);
  });

  it('sets expires to now plus the signature TTL', () => {
    const now = 1_000_000;
    const url = new URL(buildSignedDownloadUrl('Games/foo.iso', 'test-secret', BASE_URL, now));
    expect(url.searchParams.get('expires')).toBe(String(now + SIGNATURE_TTL_MS));
  });

  it('URL-encodes the path, including spaces and special characters', () => {
    const url = new URL(
      buildSignedDownloadUrl('SOFTS/quickload v3.6 + v3.8.zip', 'test-secret', BASE_URL, 1000)
    );
    expect(url.searchParams.get('path')).toBe('SOFTS/quickload v3.6 + v3.8.zip');
  });

  it('computes a signature matching HMAC-SHA256(secret, "path:expires")', () => {
    const now = 1_000_000;
    const path = 'Games/foo.iso';
    const url = new URL(buildSignedDownloadUrl(path, 'test-secret', BASE_URL, now));
    const expires = now + SIGNATURE_TTL_MS;
    const expectedSig = createHmac('sha256', 'test-secret').update(`${path}:${expires}`).digest('hex');
    expect(url.searchParams.get('sig')).toBe(expectedSig);
  });

  it('produces a different signature for a different secret', () => {
    const urlA = new URL(buildSignedDownloadUrl('Games/foo.iso', 'secret-a', BASE_URL, 1000));
    const urlB = new URL(buildSignedDownloadUrl('Games/foo.iso', 'secret-b', BASE_URL, 1000));
    expect(urlA.searchParams.get('sig')).not.toBe(urlB.searchParams.get('sig'));
  });

  it('builds against a different base URL when given one', () => {
    const url = buildSignedDownloadUrl('Games/foo.iso', 'test-secret', 'https://other.example.com', 1000);
    expect(url.startsWith('https://other.example.com/download?')).toBe(true);
  });
});
