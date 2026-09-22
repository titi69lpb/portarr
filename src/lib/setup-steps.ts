import type Database from 'better-sqlite3';
import { getSetting, setSetting } from './settings';
import { SERVICE_FIELDS, type ServiceKey } from './settings-schema';
import { resolveConfigValue } from './config';
import {
  testPlexConnection,
  testTautulliConnection,
  testJellyfinConnection,
  testJellystatConnection,
  testSonarrConnection,
  testRadarrConnection,
  testOverseerrConnection,
  testSmtpConnection,
} from './connection-test';

export interface StepResult {
  ok: boolean;
  error: string | null;
}

async function runConnectionTest(
  service: ServiceKey,
  resolved: Record<string, string>,
  fetchFn: typeof fetch
): Promise<StepResult> {
  switch (service) {
    case 'publicBaseUrl':
      return { ok: true, error: null };
    case 'plex':
      return testPlexConnection(resolved.PLEX_URL, resolved.PLEX_SERVER_TOKEN, fetchFn);
    case 'tautulli':
      return testTautulliConnection(resolved.TAUTULLI_URL, resolved.TAUTULLI_API_KEY, fetchFn);
    case 'jellyfin':
      return testJellyfinConnection(resolved.JELLYFIN_URL, resolved.JELLYFIN_API_KEY, fetchFn);
    case 'jellystat':
      return testJellystatConnection(resolved.JELLYSTAT_URL, resolved.JELLYSTAT_API_KEY, fetchFn);
    case 'jellyfinActivitySource':
      return { ok: true, error: null };
    case 'sonarr':
      return testSonarrConnection(resolved.SONARR_URL, resolved.SONARR_API_KEY, fetchFn);
    case 'radarr':
      return testRadarrConnection(resolved.RADARR_URL, resolved.RADARR_API_KEY, fetchFn);
    case 'overseerr':
      return testOverseerrConnection(resolved.OVERSEERR_URL, resolved.OVERSEERR_API_KEY, fetchFn);
    case 'smtp':
      // testSmtpConnection's second parameter is a createTransport override, not a
      // fetch override (SMTP goes over nodemailer, not HTTP) — unlike the other
      // five test* functions. Call it with just the config so it uses the real
      // createTransport; there is no fetchFn-shaped hook to inject here.
      return testSmtpConnection({
        host: resolved.SMTP_HOST,
        port: resolved.SMTP_PORT,
        user: resolved.SMTP_USER,
        pass: resolved.SMTP_PASS,
        fromAddress: resolved.MAIL_FROM_ADDRESS,
        fromName: resolved.MAIL_FROM_NAME,
      });
  }
}

// Shared by both /api/setup/step (first-run wizard) and /api/admin/settings/step
// (post-setup editing). A blank submitted value falls back to whatever's
// already resolved (env or DB) for that key rather than rejecting — this is
// what lets the admin/settings UI change just one field of a multi-field
// service without re-typing every secret. Never writes a key that's
// currently env-sourced, even if a value was submitted for it (defense in
// depth — the UI already disables those fields, but env still wins in
// loadConfig either way, so writing there would be a silent no-op at best).
export async function applyServiceSettings(
  db: Database.Database,
  service: ServiceKey,
  values: Record<string, string>,
  env: NodeJS.ProcessEnv = process.env,
  fetchFn: typeof fetch = fetch
): Promise<StepResult> {
  const fields = SERVICE_FIELDS[service];
  const resolved: Record<string, string> = {};

  for (const field of fields) {
    const submitted = values[field.envKey]?.trim();
    if (submitted) {
      resolved[field.envKey] = submitted;
      continue;
    }
    const existing = resolveConfigValue(field.envKey, env, db);
    if (!existing) {
      return { ok: false, error: `${field.label} est requis` };
    }
    resolved[field.envKey] = existing;
  }

  const testResult = await runConnectionTest(service, resolved, fetchFn);
  if (!testResult.ok) return testResult;

  for (const field of fields) {
    if (env[field.envKey]) continue;
    setSetting(db, field.envKey, resolved[field.envKey]);
  }
  return { ok: true, error: null };
}
