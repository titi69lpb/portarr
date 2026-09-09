import { describe, it, expect } from 'vitest';
import { GET } from '../../src/app/api/speedtest/ping/route';

describe('GET /api/speedtest/ping', () => {
  it('responds 200 with a no-store cache header', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('returns a minimal JSON body', async () => {
    const res = await GET();
    const body = await res.json();
    expect(body).toEqual({});
  });
});
