import type Database from 'better-sqlite3';
import { getSetting } from './settings';
import { ensureAutoSecret } from './secrets';
import type { VolumeConfig } from './storage';

export interface ShortcutConfig {
  name: string;
  url: string;
  iconUrl: string | null;
}

const SHORTCUT_DEFS: { envKey: string; name: string }[] = [
  { envKey: 'PLEX', name: 'Plex' },
  { envKey: 'OVERSEERR', name: 'Overseerr' },
  { envKey: 'TAUTULLI', name: 'Tautulli' },
  { envKey: 'WIZARR', name: 'Wizarr' },
  { envKey: 'POSTERR', name: 'Posterr' },
  { envKey: 'PLEX_REWIND', name: 'Plex Rewind' },
];

function buildShortcuts(env: NodeJS.ProcessEnv): ShortcutConfig[] {
  const shortcuts: ShortcutConfig[] = [];
  for (const { envKey, name } of SHORTCUT_DEFS) {
    const url = env[`SHORTCUT_${envKey}_URL`];
    if (!url) continue;
    shortcuts.push({ name, url, iconUrl: env[`SHORTCUT_${envKey}_ICON_URL`] ?? null });
  }
  return shortcuts;
}

function parseStorageVolumes(env: NodeJS.ProcessEnv): VolumeConfig[] {
  const raw = env.STORAGE_VOLUMES;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is VolumeConfig => typeof v === 'object' && v !== null && typeof v.name === 'string' && typeof v.path === 'string'
    );
  } catch (err) {
    console.error('Failed to parse STORAGE_VOLUMES env var as JSON:', err);
    return [];
  }
}

// Single source of truth for the env>DB>null precedence rule — used by both
// loadConfig (to build the resolved config) and getConfigSources (to tell
// the settings UI which fields are env-sourced and must be disabled there).
export function resolveConfigValue(key: string, env: NodeJS.ProcessEnv, db: Database.Database): string | null {
  return env[key] || getSetting(db, key) || null;
}

export interface PlexConfig {
  url: string;
  serverToken: string;
  serverName: string;
  clientIdentifier: string;
}
export interface TautulliConfig {
  url: string;
  apiKey: string;
}
export interface SonarrConfig {
  url: string;
  apiKey: string;
}
export interface RadarrConfig {
  url: string;
  apiKey: string;
}
export interface OverseerrConfig {
  url: string;
  apiKey: string;
}
export interface SmtpConfig {
  host: string;
  port: string;
  user: string;
  pass: string;
  fromAddress: string;
  fromName: string;
}

export interface AppConfig {
  databasePath: string;
  session: { secret: string };
  plex: PlexConfig | null;
  tautulli: TautulliConfig | null;
  sonarr: SonarrConfig | null;
  radarr: RadarrConfig | null;
  overseerr: OverseerrConfig | null;
  smtp: SmtpConfig | null;
  newsletterCronSecret: string;
  publicBaseUrl: string | null;
  filesRootPath: string | null;
  downloadSigningSecret: string;
  downloadProxyUrl: string | null;
  fsTimeoutMs: number;
  kuma: { url: string; apiKey: string } | null;
  shortcuts: ShortcutConfig[];
  storageVolumes: VolumeConfig[];
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, db: Database.Database): AppConfig {
  const v = (key: string) => resolveConfigValue(key, env, db);

  const plexUrl = v('PLEX_URL');
  const plexServerToken = v('PLEX_SERVER_TOKEN');
  const plexServerName = v('PLEX_SERVER_NAME');
  const plexClientIdentifier = ensureAutoSecret(db, 'PLEX_CLIENT_IDENTIFIER', env.PLEX_CLIENT_IDENTIFIER, 16);
  const plex: PlexConfig | null =
    plexUrl && plexServerToken && plexServerName
      ? { url: plexUrl, serverToken: plexServerToken, serverName: plexServerName, clientIdentifier: plexClientIdentifier }
      : null;

  const tautulliUrl = v('TAUTULLI_URL');
  const tautulliApiKey = v('TAUTULLI_API_KEY');
  const tautulli: TautulliConfig | null =
    tautulliUrl && tautulliApiKey ? { url: tautulliUrl, apiKey: tautulliApiKey } : null;

  const sonarrUrl = v('SONARR_URL');
  const sonarrApiKey = v('SONARR_API_KEY');
  const sonarr: SonarrConfig | null = sonarrUrl && sonarrApiKey ? { url: sonarrUrl, apiKey: sonarrApiKey } : null;

  const radarrUrl = v('RADARR_URL');
  const radarrApiKey = v('RADARR_API_KEY');
  const radarr: RadarrConfig | null = radarrUrl && radarrApiKey ? { url: radarrUrl, apiKey: radarrApiKey } : null;

  const overseerrUrl = v('OVERSEERR_URL');
  const overseerrApiKey = v('OVERSEERR_API_KEY');
  const overseerr: OverseerrConfig | null =
    overseerrUrl && overseerrApiKey ? { url: overseerrUrl, apiKey: overseerrApiKey } : null;

  const smtpHost = v('SMTP_HOST');
  const smtpPort = v('SMTP_PORT');
  const smtpUser = v('SMTP_USER');
  const smtpPass = v('SMTP_PASS');
  const mailFromAddress = v('MAIL_FROM_ADDRESS');
  const mailFromName = v('MAIL_FROM_NAME');
  const smtp: SmtpConfig | null =
    smtpHost && smtpPort && smtpUser && smtpPass && mailFromAddress && mailFromName
      ? { host: smtpHost, port: smtpPort, user: smtpUser, pass: smtpPass, fromAddress: mailFromAddress, fromName: mailFromName }
      : null;

  const publicBaseUrl = v('PUBLIC_BASE_URL');

  // Unlike the other three auto-secrets below, SESSION_SECRET is never
  // DB-backed: middleware needs it on the Edge runtime, which cannot touch
  // better-sqlite3/the DB at all (see the plan's 2026-09-18 revision). In
  // Docker, entrypoint.sh generates and exports it once before the app
  // starts, so it's always a plain env var by the time this runs.
  if (!env.SESSION_SECRET) {
    throw new Error(
      'SESSION_SECRET must be set. In Docker this is handled automatically by entrypoint.sh; ' +
        'for local development, set it explicitly (e.g. in .env.local).'
    );
  }

  return {
    databasePath: env.DATABASE_PATH ?? './data/portal.db',
    session: { secret: env.SESSION_SECRET },
    plex,
    tautulli,
    sonarr,
    radarr,
    overseerr,
    smtp,
    newsletterCronSecret: ensureAutoSecret(db, 'NEWSLETTER_CRON_SECRET', env.NEWSLETTER_CRON_SECRET),
    publicBaseUrl,
    filesRootPath: env.FILES_ROOT_PATH ?? null,
    downloadSigningSecret: ensureAutoSecret(db, 'DOWNLOAD_SIGNING_SECRET', env.DOWNLOAD_SIGNING_SECRET),
    downloadProxyUrl: env.DOWNLOAD_PROXY_URL ?? null,
    fsTimeoutMs: Number(env.FS_TIMEOUT_MS ?? '5000'),
    kuma: env.KUMA_URL && env.KUMA_API_KEY ? { url: env.KUMA_URL, apiKey: env.KUMA_API_KEY } : null,
    shortcuts: buildShortcuts(env),
    storageVolumes: parseStorageVolumes(env),
  };
}

export function isSetupComplete(config: AppConfig): boolean {
  return (
    config.plex !== null &&
    config.tautulli !== null &&
    config.sonarr !== null &&
    config.radarr !== null &&
    config.overseerr !== null &&
    config.smtp !== null &&
    config.publicBaseUrl !== null
  );
}

export interface ConfiguredAppConfig extends AppConfig {
  plex: PlexConfig;
  tautulli: TautulliConfig;
  sonarr: SonarrConfig;
  radarr: RadarrConfig;
  overseerr: OverseerrConfig;
  smtp: SmtpConfig;
  publicBaseUrl: string;
}

// Called once per request, right after loadConfig(), by every route/page
// that isn't part of the setup flow itself — the middleware setup-gate
// (Task 12) guarantees isSetupComplete() is already true by the time any of
// those call sites run, so this narrows the type instead of re-deriving
// the check. Throwing here means a bug in the middleware gate fails loudly
// instead of silently reading undefined fields.
export function assertConfigured(config: AppConfig): ConfiguredAppConfig {
  if (!isSetupComplete(config)) {
    throw new Error('assertConfigured called before setup was complete — this should be unreachable past the setup middleware gate');
  }
  return config as ConfiguredAppConfig;
}

export type ConfigSource = 'env' | 'db' | 'unset';

const CONFIGURABLE_KEYS = [
  'PUBLIC_BASE_URL',
  'PLEX_URL',
  'PLEX_SERVER_TOKEN',
  'PLEX_SERVER_NAME',
  'TAUTULLI_URL',
  'TAUTULLI_API_KEY',
  'SONARR_URL',
  'SONARR_API_KEY',
  'RADARR_URL',
  'RADARR_API_KEY',
  'OVERSEERR_URL',
  'OVERSEERR_API_KEY',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'MAIL_FROM_ADDRESS',
  'MAIL_FROM_NAME',
] as const;

export function getConfigSources(env: NodeJS.ProcessEnv, db: Database.Database): Record<string, ConfigSource> {
  const sources: Record<string, ConfigSource> = {};
  for (const key of CONFIGURABLE_KEYS) {
    if (env[key]) {
      sources[key] = 'env';
    } else if (getSetting(db, key)) {
      sources[key] = 'db';
    } else {
      sources[key] = 'unset';
    }
  }
  return sources;
}
