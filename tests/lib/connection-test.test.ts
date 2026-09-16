import { describe, it, expect, vi } from 'vitest';
import { testPlexConnection, testTautulliConnection } from '../../src/lib/connection-test';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: async () => body,
  } as Response;
}

describe('testPlexConnection', () => {
  it('succeeds when /identity returns a machineIdentifier', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ MediaContainer: { machineIdentifier: 'abc123' } }));
    const result = await testPlexConnection('https://plex.example.com', 'server-token', fetchMock);
    expect(result).toEqual({ ok: true, error: null });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://plex.example.com/identity?X-Plex-Token=server-token',
      expect.objectContaining({ headers: { Accept: 'application/json' } })
    );
  });

  it('fails with the status code when Plex responds non-ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, false, 401));
    const result = await testPlexConnection('https://plex.example.com', 'bad-token', fetchMock);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('401');
  });

  it('fails when the response has no machineIdentifier', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ MediaContainer: {} }));
    const result = await testPlexConnection('https://plex.example.com', 'token', fetchMock);
    expect(result.ok).toBe(false);
  });

  it('fails with the network error message when fetch throws', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await testPlexConnection('https://plex.example.com', 'token', fetchMock);
    expect(result).toEqual({ ok: false, error: 'ECONNREFUSED' });
  });
});

describe('testTautulliConnection', () => {
  it('succeeds when Tautulli returns result: success', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ response: { result: 'success' } }));
    const result = await testTautulliConnection('https://tautulli.example.com', 'tkey', fetchMock);
    expect(result).toEqual({ ok: true, error: null });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://tautulli.example.com/api/v2?apikey=tkey&cmd=get_server_info',
      expect.anything()
    );
  });

  it('fails with the Tautulli message when result is not success', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ response: { result: 'error', message: 'Invalid apikey' } }));
    const result = await testTautulliConnection('https://tautulli.example.com', 'bad-key', fetchMock);
    expect(result).toEqual({ ok: false, error: 'Invalid apikey' });
  });

  it('fails with the status code when the HTTP call itself is non-ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, false, 500));
    const result = await testTautulliConnection('https://tautulli.example.com', 'tkey', fetchMock);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('500');
  });

  it('fails with the network error message when fetch throws', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('ETIMEDOUT'));
    const result = await testTautulliConnection('https://tautulli.example.com', 'tkey', fetchMock);
    expect(result).toEqual({ ok: false, error: 'ETIMEDOUT' });
  });
});
