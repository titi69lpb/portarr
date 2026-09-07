import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const REQUIRED_ENV: Record<string, string> = {
  DATABASE_PATH: ':memory:',
  SESSION_SECRET: 'test-secret-at-least-32-characters-long',
  PLEX_URL: 'https://plex.local',
  PLEX_SERVER_TOKEN: 'server-token',
  PLEX_SERVER_NAME: 'My Plex Server',
  PLEX_CLIENT_IDENTIFIER: 'cid',
  TAUTULLI_URL: 'http://tautulli.local',
  TAUTULLI_API_KEY: 'tautulli-key',
  SONARR_URL: 'http://sonarr.local',
  SONARR_API_KEY: 'sonarr-key',
  RADARR_URL: 'http://radarr.local',
  RADARR_API_KEY: 'radarr-key',
  SMTP_HOST: 'mail.local',
  SMTP_PORT: '465',
  SMTP_USER: 'smtpuser',
  SMTP_PASS: 'smtppass',
  MAIL_FROM_ADDRESS: 'admin@local',
  MAIL_FROM_NAME: 'My Plex Server',
  NEWSLETTER_CRON_SECRET: 'cron-secret',
  PUBLIC_BASE_URL: 'https://portal.example.com',
  OVERSEERR_URL: 'https://overseerr.example.com',
  OVERSEERR_API_KEY: 'overseerr-key',
  FILES_ROOT_PATH: '/mnt/qnap-software',
  DOWNLOAD_SIGNING_SECRET: 'a-long-random-signing-secret',
};

let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = {};
  for (const [key, value] of Object.entries(REQUIRED_ENV)) {
    savedEnv[key] = process.env[key];
    process.env[key] = value;
  }
});

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.restoreAllMocks();
});

describe('GET /api/newsletter/poster', () => {
  it('returns the placeholder poster (200), never fetches upstream, for a malformed path', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    const { GET } = await import('../../src/app/api/newsletter/poster/route');
    const request = new NextRequest('http://localhost/api/newsletter/poster?path=%2Fetc%2Fpasswd');
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/svg+xml');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns the placeholder poster (200) when path is missing', async () => {
    const { GET } = await import('../../src/app/api/newsletter/poster/route');
    const request = new NextRequest('http://localhost/api/newsletter/poster');
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/svg+xml');
  });

  it('proxies a valid path and forwards the content type', async () => {
    const fakeImageBytes = new Uint8Array([1, 2, 3]);
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(fakeImageBytes, { status: 200, headers: { 'Content-Type': 'image/jpeg' } })
    );
    const { GET } = await import('../../src/app/api/newsletter/poster/route');
    const request = new NextRequest(
      'http://localhost/api/newsletter/poster?path=' + encodeURIComponent('/library/metadata/1/thumb/1')
    );
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    const body = new Uint8Array(await response.arrayBuffer());
    expect(Array.from(body)).toEqual([1, 2, 3]);
  });

  it('requests the Plex transcoder (300x450), never the raw full-resolution thumb', async () => {
    // Regression lock for the 2026-09-05 hotfix: the raw thumb path returns the
    // full source poster (seen in practice: 2000x3000px, ~1.5MB) even though
    // every consumer here renders it at a few hundred CSS pixels at most.
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(new Uint8Array([1]), { status: 200, headers: { 'Content-Type': 'image/jpeg' } }));
    const { GET } = await import('../../src/app/api/newsletter/poster/route');
    const path = '/library/metadata/1/thumb/1';
    const request = new NextRequest('http://localhost/api/newsletter/poster?path=' + encodeURIComponent(path));
    await GET(request);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const requestedUrl = String(fetchSpy.mock.calls[0][0]);
    expect(requestedUrl).toContain('https://plex.local/photo/:/transcode?');
    expect(requestedUrl).toContain('width=300');
    expect(requestedUrl).toContain('height=450');
    expect(requestedUrl).toContain(`url=${encodeURIComponent(path)}`);
    expect(requestedUrl).toContain('X-Plex-Token=server-token');
    // The raw thumb URL the old, unresized fetch used to hit — must never be called directly.
    expect(requestedUrl).not.toBe(`https://plex.local${path}?X-Plex-Token=server-token`);
  });

  it('returns the placeholder poster (200) when the upstream Plex fetch fails', async () => {
    // Real recurring case: a stats/history entry points at media that has since
    // been deleted (e.g. after a storage incident) — the item's thumb 404s even
    // though the path itself is well-formed. Every consumer of this route is a
    // Server Component with no onError fallback available, so degrading to a
    // real (blank) image here — rather than an error status — is what keeps
    // the layout intact instead of showing a broken-image glyph.
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 404 }));
    const { GET } = await import('../../src/app/api/newsletter/poster/route');
    const request = new NextRequest(
      'http://localhost/api/newsletter/poster?path=' + encodeURIComponent('/library/metadata/1/thumb/1')
    );
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/svg+xml');
  });

  it('returns the same placeholder poster (200) when the fetch itself throws', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network error'));
    const { GET } = await import('../../src/app/api/newsletter/poster/route');
    const request = new NextRequest(
      'http://localhost/api/newsletter/poster?path=' + encodeURIComponent('/library/metadata/1/thumb/1')
    );
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/svg+xml');
  });
});
