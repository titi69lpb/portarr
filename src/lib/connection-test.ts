import { timeoutSignal } from './fetch-timeout';
import { createTransport } from './mailer';
import { jellyfinTokenAuth } from './media/jellyfin';
import { t } from './i18n/translate';
import { DEFAULT_LOCALE, type Locale } from './i18n/dictionaries';

// `error` is a ready-to-display fallback (default locale). When the message is
// one of ours (not a raw upstream/network message) `errorKey` + `errorVars`
// carry the stable i18n key so the UI can re-render it in the viewer's locale.
export interface ConnectionTestResult {
  ok: boolean;
  error: string | null;
  errorKey?: string;
  errorVars?: Record<string, string | number>;
}

function fail(key: string, vars?: Record<string, string | number>): ConnectionTestResult {
  return { ok: false, error: t(DEFAULT_LOCALE, key, vars), errorKey: key, errorVars: vars };
}

function statusFail(service: string, res: { status: number; statusText: string }): ConnectionTestResult {
  return fail('settings.errors.serviceStatus', { service, status: res.status, statusText: res.statusText });
}

function messageFromError(err: unknown): ConnectionTestResult {
  if (err instanceof Error) return { ok: false, error: err.message };
  return fail('settings.errors.network');
}

export async function testPlexConnection(
  url: string,
  serverToken: string,
  fetchFn: typeof fetch = fetch
): Promise<ConnectionTestResult> {
  try {
    const res = await fetchFn(`${url}/identity?X-Plex-Token=${encodeURIComponent(serverToken)}`, {
      headers: { Accept: 'application/json' },
      signal: timeoutSignal(),
      cache: 'no-store',
    });
    if (!res.ok) return statusFail('Plex', res);
    const data = (await res.json()) as { MediaContainer?: { machineIdentifier?: string } };
    if (!data.MediaContainer?.machineIdentifier) {
      return fail('settings.errors.plexUnexpected');
    }
    return { ok: true, error: null };
  } catch (err) {
    return messageFromError(err);
  }
}

export async function testTautulliConnection(
  url: string,
  apiKey: string,
  fetchFn: typeof fetch = fetch
): Promise<ConnectionTestResult> {
  try {
    const res = await fetchFn(`${url}/api/v2?apikey=${encodeURIComponent(apiKey)}&cmd=get_server_info`, {
      signal: timeoutSignal(),
      cache: 'no-store',
    });
    if (!res.ok) return statusFail('Tautulli', res);
    const data = (await res.json()) as { response?: { result?: string; message?: string } };
    if (data.response?.result !== 'success') {
      return data.response?.message
        ? { ok: false, error: data.response.message }
        : fail('settings.errors.tautulliUnexpected');
    }
    return { ok: true, error: null };
  } catch (err) {
    return messageFromError(err);
  }
}

export async function testJellyfinConnection(
  url: string,
  apiKey: string,
  fetchFn: typeof fetch = fetch
): Promise<ConnectionTestResult> {
  try {
    const res = await fetchFn(`${url.replace(/\/+$/, '')}/System/Info`, {
      headers: { Authorization: jellyfinTokenAuth(apiKey), Accept: 'application/json' },
      signal: timeoutSignal(),
      cache: 'no-store',
    });
    if (!res.ok) return statusFail('Jellyfin', res);
    const data = (await res.json()) as { Id?: string };
    if (!data.Id) {
      return fail('settings.errors.jellyfinUnexpected');
    }
    return { ok: true, error: null };
  } catch (err) {
    return messageFromError(err);
  }
}

export async function testJellystatConnection(
  url: string,
  apiKey: string,
  fetchFn: typeof fetch = fetch
): Promise<ConnectionTestResult> {
  try {
    const res = await fetchFn(`${url.replace(/\/+$/, '')}/api/keys`, {
      headers: { 'x-api-token': apiKey, Accept: 'application/json' },
      signal: timeoutSignal(),
      cache: 'no-store',
    });
    if (!res.ok) return statusFail('Jellystat', res);
    return { ok: true, error: null };
  } catch (err) {
    return messageFromError(err);
  }
}

async function testArrConnection(
  serviceName: string,
  url: string,
  apiKey: string,
  fetchFn: typeof fetch
): Promise<ConnectionTestResult> {
  try {
    const res = await fetchFn(`${url}/api/v3/system/status`, {
      headers: { 'X-Api-Key': apiKey },
      signal: timeoutSignal(),
      cache: 'no-store',
    });
    if (!res.ok) return statusFail(serviceName, res);
    return { ok: true, error: null };
  } catch (err) {
    return messageFromError(err);
  }
}

export async function testSonarrConnection(
  url: string,
  apiKey: string,
  fetchFn: typeof fetch = fetch
): Promise<ConnectionTestResult> {
  return testArrConnection('Sonarr', url, apiKey, fetchFn);
}

export async function testRadarrConnection(
  url: string,
  apiKey: string,
  fetchFn: typeof fetch = fetch
): Promise<ConnectionTestResult> {
  return testArrConnection('Radarr', url, apiKey, fetchFn);
}

export async function testOverseerrConnection(
  url: string,
  apiKey: string,
  fetchFn: typeof fetch = fetch
): Promise<ConnectionTestResult> {
  try {
    const res = await fetchFn(`${url}/api/v1/status`, {
      headers: { 'X-Api-Key': apiKey },
      signal: timeoutSignal(),
      cache: 'no-store',
    });
    if (!res.ok) return statusFail('Overseerr', res);
    return { ok: true, error: null };
  } catch (err) {
    return messageFromError(err);
  }
}

export async function testSmtpConnection(
  config: { host: string; port: string; user: string; pass: string; fromAddress: string; fromName: string },
  createTransportFn: typeof createTransport = createTransport,
  locale: Locale = DEFAULT_LOCALE
): Promise<ConnectionTestResult> {
  try {
    const transport = createTransportFn({ host: config.host, port: config.port, user: config.user, pass: config.pass });
    await transport.sendMail({
      from: `${config.fromName} <${config.fromAddress}>`,
      to: config.fromAddress,
      subject: t(locale, 'email.smtpTestSubject'),
      html: `<p>${t(locale, 'email.smtpTestBody')}</p>`,
    });
    return { ok: true, error: null };
  } catch (err) {
    return messageFromError(err);
  }
}
