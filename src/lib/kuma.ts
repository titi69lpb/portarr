import { timeoutSignal } from './fetch-timeout';
import { withTtlCache, DEFAULT_CACHE_TTL_MS } from './ttl-cache';

export interface KumaStatus {
  total: number;
  down: number;
}

const MONITOR_STATUS_LINE = /^monitor_status\{[^}]*\}\s+([\d.]+)\s*$/gm;

// Uptime Kuma's own Prometheus /metrics endpoint — no dedicated REST API for
// a simple "how many monitors are down" summary, and this repo already has
// the pattern (Basic Auth, key as password, empty username) documented for
// this exact key elsewhere in the infra. Parsed as plain text rather than a
// full Prometheus client library — one metric family, not worth the dependency.
export async function getKumaStatus(
  kumaUrl: string,
  apiKey: string,
  fetchFn: typeof fetch = fetch
): Promise<KumaStatus> {
  return withTtlCache(`kuma-status:${kumaUrl}`, DEFAULT_CACHE_TTL_MS, async () => {
    const res = await fetchFn(`${kumaUrl}/metrics`, {
      headers: { Authorization: `Basic ${Buffer.from(`:${apiKey}`).toString('base64')}` },
      signal: timeoutSignal(),
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`Kuma API request failed: ${res.status} ${res.statusText}`);
    }
    const text = await res.text();

    let total = 0;
    let down = 0;
    for (const match of text.matchAll(MONITOR_STATUS_LINE)) {
      total++;
      if (Number(match[1]) === 0) down++;
    }
    return { total, down };
  });
}
