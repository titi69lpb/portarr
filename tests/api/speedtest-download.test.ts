import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../../src/app/api/speedtest/download/route';
import { MAX_DOWNLOAD_BYTES } from '../../src/lib/speedtest';

describe('GET /api/speedtest/download', () => {
  it('rejects a missing size', async () => {
    const req = new NextRequest('http://localhost/api/speedtest/download');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('rejects a non-numeric size', async () => {
    const req = new NextRequest('http://localhost/api/speedtest/download?size=abc');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('rejects a zero or negative size', async () => {
    const req = new NextRequest('http://localhost/api/speedtest/download?size=0');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('sets Cache-Control: no-store on the error path too', async () => {
    const req = new NextRequest('http://localhost/api/speedtest/download?size=0');
    const res = await GET(req);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('streams exactly the requested size when under the cap, with no-store', async () => {
    const req = new NextRequest('http://localhost/api/speedtest/download?size=1024');
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/octet-stream');
    expect(res.headers.get('content-length')).toBe('1024');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const buf = await res.arrayBuffer();
    expect(buf.byteLength).toBe(1024);
  });

  it('caps the response at MAX_DOWNLOAD_BYTES when a larger size is requested', async () => {
    const req = new NextRequest(`http://localhost/api/speedtest/download?size=${MAX_DOWNLOAD_BYTES * 2}`);
    const res = await GET(req);
    expect(res.headers.get('content-length')).toBe(String(MAX_DOWNLOAD_BYTES));
    const buf = await res.arrayBuffer();
    expect(buf.byteLength).toBe(MAX_DOWNLOAD_BYTES);
  });

  it('produces non-deterministic content (random, not zero-filled)', async () => {
    const req = new NextRequest('http://localhost/api/speedtest/download?size=4096');
    const res = await GET(req);
    const buf = new Uint8Array(await res.arrayBuffer());
    const allZero = buf.every((b) => b === 0);
    expect(allZero).toBe(false);
  });
});
