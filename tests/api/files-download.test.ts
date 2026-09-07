import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createHmac } from 'crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SIGNATURE_TTL_MS } from '../../src/lib/sign-download-url';

const HANG_PATH = 'hang-forever';
const PROXY_BASE_URL = 'https://dl.example.com';

vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>();
  return {
    ...actual,
    realpath: (path: unknown, ...rest: unknown[]) => {
      if (typeof path === 'string' && path.endsWith(HANG_PATH)) {
        return new Promise(() => {});
      }
      return actual.realpath(path as string, ...(rest as []));
    },
  };
});

const BASE_ENV: Record<string, string> = {
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
  DOWNLOAD_SIGNING_SECRET: 'test-signing-secret-at-least-32-characters-long',
  FS_TIMEOUT_MS: '50',
};

let root: string;
let savedEnv: Record<string, string | undefined> = {};

function setEnv(env: Record<string, string>) {
  savedEnv = {};
  for (const [key, value] of Object.entries(env)) {
    savedEnv[key] = process.env[key];
    process.env[key] = value;
  }
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'portal-download-test-'));
  writeFileSync(join(root, 'installer.bin'), Buffer.alloc(20, 'a'));
});

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('GET /api/files/download — proxy configured', () => {
  beforeEach(() => {
    setEnv({ ...BASE_ENV, FILES_ROOT_PATH: root, DOWNLOAD_PROXY_URL: PROXY_BASE_URL });
  });

  it('redirects (302) to a signed URL on the proxy base for a valid file', async () => {
    const { GET } = await import('../../src/app/api/files/download/route');
    const request = new NextRequest('http://localhost/api/files/download?path=installer.bin');
    const response = await GET(request);
    expect(response.status).toBe(302);
    const location = response.headers.get('location');
    expect(location).not.toBeNull();
    expect(location!.startsWith(`${PROXY_BASE_URL}/download?`)).toBe(true);
  });

  it('the redirect URL carries a signature matching the shared secret and the requested path', async () => {
    const { GET } = await import('../../src/app/api/files/download/route');
    const request = new NextRequest('http://localhost/api/files/download?path=installer.bin');
    const before = Date.now();
    const response = await GET(request);
    const location = new URL(response.headers.get('location')!);
    expect(location.searchParams.get('path')).toBe('installer.bin');

    const expires = Number(location.searchParams.get('expires'));
    expect(expires).toBeGreaterThanOrEqual(before + SIGNATURE_TTL_MS);
    const expectedSig = createHmac('sha256', BASE_ENV.DOWNLOAD_SIGNING_SECRET)
      .update(`installer.bin:${expires}`)
      .digest('hex');
    expect(location.searchParams.get('sig')).toBe(expectedSig);
  });
});

describe('GET /api/files/download — no proxy configured (direct serve)', () => {
  beforeEach(() => {
    setEnv({ ...BASE_ENV, FILES_ROOT_PATH: root });
  });

  it('streams the file directly with a 200 and the full content', async () => {
    const { GET } = await import('../../src/app/api/files/download/route');
    const request = new NextRequest('http://localhost/api/files/download?path=installer.bin');
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-length')).toBe('20');
    const body = await response.arrayBuffer();
    expect(body.byteLength).toBe(20);
  });

  it('sets a Content-Disposition attachment header with the filename', async () => {
    const { GET } = await import('../../src/app/api/files/download/route');
    const request = new NextRequest('http://localhost/api/files/download?path=installer.bin');
    const response = await GET(request);
    expect(response.headers.get('content-disposition')).toContain('attachment');
    expect(response.headers.get('content-disposition')).toContain('installer.bin');
  });

  it('serves a partial response (206) honoring a Range header', async () => {
    const { GET } = await import('../../src/app/api/files/download/route');
    const request = new NextRequest('http://localhost/api/files/download?path=installer.bin', {
      headers: { Range: 'bytes=0-9' },
    });
    const response = await GET(request);
    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 0-9/20');
    expect(response.headers.get('content-length')).toBe('10');
    const body = await response.arrayBuffer();
    expect(body.byteLength).toBe(10);
  });

  it('clamps an over-long range end to the file size and serves the full body as 206', async () => {
    const { GET } = await import('../../src/app/api/files/download/route');
    const request = new NextRequest('http://localhost/api/files/download?path=installer.bin', {
      headers: { Range: 'bytes=0-1999' },
    });
    const response = await GET(request);
    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 0-19/20');
    const body = await response.arrayBuffer();
    expect(body.byteLength).toBe(20);
  });

  it('returns 416 with Content-Range for an unsatisfiable range (start beyond EOF)', async () => {
    const { GET } = await import('../../src/app/api/files/download/route');
    const request = new NextRequest('http://localhost/api/files/download?path=installer.bin', {
      headers: { Range: 'bytes=2000-3000' },
    });
    const response = await GET(request);
    expect(response.status).toBe(416);
    expect(response.headers.get('content-range')).toBe('bytes */20');
  });
});

describe('GET /api/files/download — shared behavior', () => {
  beforeEach(() => {
    setEnv({ ...BASE_ENV, FILES_ROOT_PATH: root });
  });

  it('returns 404 for a path that escapes the root', async () => {
    const { GET } = await import('../../src/app/api/files/download/route');
    const request = new NextRequest(
      'http://localhost/api/files/download?path=' + encodeURIComponent('../etc/passwd')
    );
    const response = await GET(request);
    expect(response.status).toBe(404);
  });

  it('returns 400 when the path points at a directory', async () => {
    mkdirSync(join(root, 'a-folder'));
    const { GET } = await import('../../src/app/api/files/download/route');
    const request = new NextRequest('http://localhost/api/files/download?path=a-folder');
    const response = await GET(request);
    expect(response.status).toBe(400);
  });

  it('returns 503 (not 404) when the NAS mount hangs while resolving the path', async () => {
    const { GET } = await import('../../src/app/api/files/download/route');
    const request = new NextRequest(
      'http://localhost/api/files/download?path=' + encodeURIComponent(HANG_PATH)
    );
    const response = await GET(request);
    expect(response.status).toBe(503);
  });
});

describe('GET /api/files/download — FILES_ROOT_PATH not configured', () => {
  beforeEach(() => {
    setEnv({ ...BASE_ENV });
  });

  it('returns 404 when FILES_ROOT_PATH is not set', async () => {
    const { GET } = await import('../../src/app/api/files/download/route');
    const request = new NextRequest('http://localhost/api/files/download?path=installer.bin');
    const response = await GET(request);
    expect(response.status).toBe(404);
  });
});
