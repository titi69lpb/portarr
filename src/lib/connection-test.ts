import { timeoutSignal } from './fetch-timeout';

export interface ConnectionTestResult {
  ok: boolean;
  error: string | null;
}

function messageFromError(err: unknown): string {
  return err instanceof Error ? err.message : 'Erreur réseau inconnue';
}

export async function testPlexConnection(
  url: string,
  serverToken: string,
  fetchFn: typeof fetch = fetch
): Promise<ConnectionTestResult> {
  try {
    const res = await fetchFn(`${url}/identity?X-Plex-Token=${serverToken}`, {
      headers: { Accept: 'application/json' },
      signal: timeoutSignal(),
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false, error: `Plex a répondu ${res.status} ${res.statusText}` };
    const data = (await res.json()) as { MediaContainer?: { machineIdentifier?: string } };
    if (!data.MediaContainer?.machineIdentifier) {
      return { ok: false, error: 'Réponse Plex inattendue (pas de machineIdentifier)' };
    }
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: messageFromError(err) };
  }
}

export async function testTautulliConnection(
  url: string,
  apiKey: string,
  fetchFn: typeof fetch = fetch
): Promise<ConnectionTestResult> {
  try {
    const res = await fetchFn(`${url}/api/v2?apikey=${apiKey}&cmd=get_server_info`, {
      signal: timeoutSignal(),
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false, error: `Tautulli a répondu ${res.status} ${res.statusText}` };
    const data = (await res.json()) as { response?: { result?: string; message?: string } };
    if (data.response?.result !== 'success') {
      return { ok: false, error: data.response?.message ?? 'Réponse Tautulli inattendue' };
    }
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: messageFromError(err) };
  }
}
