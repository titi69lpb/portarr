import { describe, it, expect, vi } from 'vitest';
import { testPlexConnection, testTautulliConnection, testSonarrConnection, testRadarrConnection, testOverseerrConnection, testSmtpConnection } from '../../src/lib/connection-test';
import type { MailTransport } from '../../src/lib/mailer';

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

describe('testSonarrConnection', () => {
  it('succeeds on a 200 from /api/v3/system/status with the api key header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    const result = await testSonarrConnection('https://sonarr.example.com', 'skey', fetchMock);
    expect(result).toEqual({ ok: true, error: null });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://sonarr.example.com/api/v3/system/status',
      expect.objectContaining({ headers: { 'X-Api-Key': 'skey' } })
    );
  });

  it('fails with the status code on a non-ok response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, false, 401));
    const result = await testSonarrConnection('https://sonarr.example.com', 'bad-key', fetchMock);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('401');
  });
});

describe('testRadarrConnection', () => {
  it('succeeds on a 200 from /api/v3/system/status with the api key header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    const result = await testRadarrConnection('https://radarr.example.com', 'rkey', fetchMock);
    expect(result).toEqual({ ok: true, error: null });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://radarr.example.com/api/v3/system/status',
      expect.objectContaining({ headers: { 'X-Api-Key': 'rkey' } })
    );
  });

  it('fails with the network error message when fetch throws', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('ETIMEDOUT'));
    const result = await testRadarrConnection('https://radarr.example.com', 'rkey', fetchMock);
    expect(result).toEqual({ ok: false, error: 'ETIMEDOUT' });
  });
});

describe('testOverseerrConnection', () => {
  it('succeeds on a 200 from /api/v1/status with the api key header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    const result = await testOverseerrConnection('https://overseerr.example.com', 'okey', fetchMock);
    expect(result).toEqual({ ok: true, error: null });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://overseerr.example.com/api/v1/status',
      expect.objectContaining({ headers: { 'X-Api-Key': 'okey' } })
    );
  });

  it('fails with the status code on a non-ok response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, false, 403));
    const result = await testOverseerrConnection('https://overseerr.example.com', 'bad-key', fetchMock);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('403');
  });
});

describe('testSmtpConnection', () => {
  const SMTP_CONFIG = {
    host: 'mail.example.com',
    port: '465',
    user: 'smtpuser',
    pass: 'smtppass',
    fromAddress: 'admin@example.com',
    fromName: 'Portarr',
  };

  it('succeeds and sends a test email to the from-address', async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: 'abc' });
    const fakeTransport: MailTransport = { sendMail };
    const createTransportFn = vi.fn().mockReturnValue(fakeTransport);

    const result = await testSmtpConnection(SMTP_CONFIG, createTransportFn);

    expect(result).toEqual({ ok: true, error: null });
    expect(createTransportFn).toHaveBeenCalledWith({
      host: 'mail.example.com',
      port: '465',
      user: 'smtpuser',
      pass: 'smtppass',
    });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'admin@example.com', from: 'Portarr <admin@example.com>' })
    );
  });

  it('fails with the SMTP error message when sendMail rejects', async () => {
    const sendMail = vi.fn().mockRejectedValue(new Error('535 Authentication failed'));
    const createTransportFn = vi.fn().mockReturnValue({ sendMail } as MailTransport);

    const result = await testSmtpConnection(SMTP_CONFIG, createTransportFn);

    expect(result).toEqual({ ok: false, error: '535 Authentication failed' });
  });
});
