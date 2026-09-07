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

export interface AppConfig {
  databasePath: string;
  session: { secret: string };
  plex: { url: string; serverToken: string; serverName: string; clientIdentifier: string };
  tautulli: { url: string; apiKey: string };
  sonarr: { url: string; apiKey: string };
  radarr: { url: string; apiKey: string };
  smtp: {
    host: string;
    port: string;
    user: string;
    pass: string;
    fromAddress: string;
    fromName: string;
  };
  newsletterCronSecret: string;
  publicBaseUrl: string;
  overseerr: { url: string; apiKey: string };
  // Not in REQUIRED_VARS — optional. null means the /files page, the sidebar
  // "Fichiers" link, and the download route are all disabled.
  filesRootPath: string | null;
  // Not in REQUIRED_VARS — optional, required only if filesRootPath is set
  // and downloads should be signed (direct-serve fallback works without it,
  // see the download route in Task 6, but redirects to a proxy need it).
  downloadSigningSecret: string | null;
  // Not in REQUIRED_VARS — optional. When set, /api/files/download redirects
  // to this base URL instead of streaming the file itself (WireGuard-bypass
  // pattern). null falls back to direct-serve. See Task 6.
  downloadProxyUrl: string | null;
  // Timeout (ms) for filesystem calls against the QNAP mount (realpath/readdir/stat).
  // Not in REQUIRED_VARS — optional, defaults to 5000. Overridable via env so tests
  // can exercise the timeout path without waiting on the production-sized default.
  fsTimeoutMs: number;
  // Not in REQUIRED_VARS — optional, powers the dashboard's Kuma status badge.
  // null (either var unset) means the badge is simply not shown, rather than
  // failing the whole app's startup over a decorative status indicator.
  kuma: { url: string; apiKey: string } | null;
  // Not in REQUIRED_VARS — optional per-shortcut sidebar links. A shortcut is
  // included only if its _URL var is set; iconUrl is null (name-only link) if
  // the matching _ICON_URL is absent. See buildShortcuts / SHORTCUT_DEFS.
  shortcuts: ShortcutConfig[];
  // Not in REQUIRED_VARS — optional, JSON array from STORAGE_VOLUMES. Empty
  // (not a throw) on missing/invalid JSON — the admin Storage section simply
  // doesn't render. See parseStorageVolumes.
  storageVolumes: VolumeConfig[];
}

const REQUIRED_VARS = [
  'DATABASE_PATH',
  'SESSION_SECRET',
  'PLEX_URL',
  'PLEX_SERVER_TOKEN',
  'PLEX_SERVER_NAME',
  'PLEX_CLIENT_IDENTIFIER',
  'TAUTULLI_URL',
  'TAUTULLI_API_KEY',
  'SONARR_URL',
  'SONARR_API_KEY',
  'RADARR_URL',
  'RADARR_API_KEY',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'MAIL_FROM_ADDRESS',
  'MAIL_FROM_NAME',
  'NEWSLETTER_CRON_SECRET',
  'PUBLIC_BASE_URL',
  'OVERSEERR_URL',
  'OVERSEERR_API_KEY',
] as const;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const missing = REQUIRED_VARS.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const vars = Object.fromEntries(
    REQUIRED_VARS.map((key) => [key, env[key] as string])
  ) as Record<(typeof REQUIRED_VARS)[number], string>;

  return {
    databasePath: vars.DATABASE_PATH,
    session: { secret: vars.SESSION_SECRET },
    plex: {
      url: vars.PLEX_URL,
      serverToken: vars.PLEX_SERVER_TOKEN,
      serverName: vars.PLEX_SERVER_NAME,
      clientIdentifier: vars.PLEX_CLIENT_IDENTIFIER,
    },
    tautulli: { url: vars.TAUTULLI_URL, apiKey: vars.TAUTULLI_API_KEY },
    sonarr: { url: vars.SONARR_URL, apiKey: vars.SONARR_API_KEY },
    radarr: { url: vars.RADARR_URL, apiKey: vars.RADARR_API_KEY },
    smtp: {
      host: vars.SMTP_HOST,
      port: vars.SMTP_PORT,
      user: vars.SMTP_USER,
      pass: vars.SMTP_PASS,
      fromAddress: vars.MAIL_FROM_ADDRESS,
      fromName: vars.MAIL_FROM_NAME,
    },
    newsletterCronSecret: vars.NEWSLETTER_CRON_SECRET,
    publicBaseUrl: vars.PUBLIC_BASE_URL,
    overseerr: { url: vars.OVERSEERR_URL, apiKey: vars.OVERSEERR_API_KEY },
    filesRootPath: env.FILES_ROOT_PATH ?? null,
    downloadSigningSecret: env.DOWNLOAD_SIGNING_SECRET ?? null,
    downloadProxyUrl: env.DOWNLOAD_PROXY_URL ?? null,
    fsTimeoutMs: Number(env.FS_TIMEOUT_MS ?? '5000'),
    kuma: env.KUMA_URL && env.KUMA_API_KEY ? { url: env.KUMA_URL, apiKey: env.KUMA_API_KEY } : null,
    shortcuts: buildShortcuts(env),
    storageVolumes: parseStorageVolumes(env),
  };
}
