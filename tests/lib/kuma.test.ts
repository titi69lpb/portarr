import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getKumaStatus } from '../../src/lib/kuma';
import { resetTtlCacheForTests } from '../../src/lib/ttl-cache';

beforeEach(() => {
  resetTtlCacheForTests();
});

function metricsResponse(body: string, ok = true) {
  return { ok, status: ok ? 200 : 500, statusText: ok ? 'OK' : 'Error', text: async () => body } as Response;
}

describe('getKumaStatus', () => {
  it('counts total monitors and how many are down (status 0)', async () => {
    const body = [
      'monitor_status{monitor_id="1",monitor_name="A"} 1',
      'monitor_status{monitor_id="2",monitor_name="B"} 0',
      'monitor_status{monitor_id="3",monitor_name="C"} 1',
      'monitor_cert_is_valid{monitor_id="1",monitor_name="A"} 1', // different metric, must be ignored
    ].join('\n');
    const fetchMock = vi.fn().mockResolvedValue(metricsResponse(body));
    const result = await getKumaStatus('https://kuma.example.com', 'apikey', fetchMock);
    expect(result).toEqual({ total: 3, down: 1 });
  });

  it('sends the API key as Basic Auth password with an empty username', async () => {
    const fetchMock = vi.fn().mockResolvedValue(metricsResponse(''));
    await getKumaStatus('https://kuma.example.com', 'my-secret-key', fetchMock);
    const [, options] = fetchMock.mock.calls[0];
    const expected = `Basic ${Buffer.from(':my-secret-key').toString('base64')}`;
    expect(options.headers.Authorization).toBe(expected);
  });

  it('returns zero/zero when there are no monitor_status lines', async () => {
    const fetchMock = vi.fn().mockResolvedValue(metricsResponse('# no monitors\n'));
    expect(await getKumaStatus('https://kuma.example.com', 'apikey', fetchMock)).toEqual({ total: 0, down: 0 });
  });

  it('throws when the API returns an error status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(metricsResponse('', false));
    await expect(getKumaStatus('https://kuma.example.com', 'apikey', fetchMock)).rejects.toThrow(
      'Kuma API request failed: 500 Error'
    );
  });

  it('caches the result — a second call within the TTL does not hit Kuma again', async () => {
    const fetchMock = vi.fn().mockResolvedValue(metricsResponse('monitor_status{monitor_id="1"} 1'));
    await getKumaStatus('https://kuma.example.com', 'apikey', fetchMock);
    await getKumaStatus('https://kuma.example.com', 'apikey', fetchMock);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
