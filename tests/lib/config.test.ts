import { describe, it, expect } from 'vitest';
import { loadConfig } from '../../src/lib/config';

const VALID_ENV = {
  DATABASE_PATH: './data/portal.db',
  SESSION_SECRET: 'a'.repeat(32),
  PLEX_URL: 'https://plex.example.com',
  PLEX_SERVER_TOKEN: 'token',
  PLEX_SERVER_NAME: 'My Plex Server',
  PLEX_CLIENT_IDENTIFIER: 'uuid-1234',
  TAUTULLI_URL: 'https://tautulli.example.com',
  TAUTULLI_API_KEY: 'tkey',
  SONARR_URL: 'https://sonarr.example.com',
  SONARR_API_KEY: 'skey',
  RADARR_URL: 'https://radarr.example.com',
  RADARR_API_KEY: 'rkey',
  SMTP_HOST: 'mail.example.com',
  SMTP_PORT: '465',
  SMTP_USER: 'smtpuser',
  SMTP_PASS: 'smtppass',
  MAIL_FROM_ADDRESS: 'admin@example.com',
  MAIL_FROM_NAME: 'My Plex Server',
  NEWSLETTER_CRON_SECRET: 'a-long-random-cron-secret',
  PUBLIC_BASE_URL: 'https://portal.example.com',
  OVERSEERR_URL: 'https://overseerr.example.com',
  OVERSEERR_API_KEY: 'overseerr-key',
  FILES_ROOT_PATH: '/mnt/qnap-software',
  DOWNLOAD_SIGNING_SECRET: 'a-long-random-signing-secret',
};

describe('loadConfig', () => {
  it('returns a typed config object when all variables are present', () => {
    const config = loadConfig(VALID_ENV);
    expect(config.plex.url).toBe('https://plex.example.com');
    expect(config.session.secret).toBe('a'.repeat(32));
    expect(config.newsletterCronSecret).toBe('a-long-random-cron-secret');
    expect(config.publicBaseUrl).toBe('https://portal.example.com');
    expect(config.overseerr.url).toBe('https://overseerr.example.com');
    expect(config.overseerr.apiKey).toBe('overseerr-key');
    expect(config.filesRootPath).toBe('/mnt/qnap-software');
    expect(config.downloadSigningSecret).toBe('a-long-random-signing-secret');
  });

  it('sets kuma to null when KUMA_URL/KUMA_API_KEY are not set — optional, not in REQUIRED_VARS', () => {
    expect(loadConfig(VALID_ENV).kuma).toBeNull();
  });

  it('sets kuma when both KUMA_URL and KUMA_API_KEY are present', () => {
    const config = loadConfig({ ...VALID_ENV, KUMA_URL: 'https://kuma.example.com', KUMA_API_KEY: 'kuma-key' });
    expect(config.kuma).toEqual({ url: 'https://kuma.example.com', apiKey: 'kuma-key' });
  });

  it('sets kuma to null when only one of the two is present', () => {
    expect(loadConfig({ ...VALID_ENV, KUMA_URL: 'https://kuma.example.com' }).kuma).toBeNull();
  });

  it('throws listing every missing variable at once', () => {
    const partial = { DATABASE_PATH: './data/portal.db' };
    expect(() => loadConfig(partial)).toThrowError(/SESSION_SECRET/);
    expect(() => loadConfig(partial)).toThrowError(/PLEX_URL/);
    expect(() => loadConfig(partial)).toThrowError(/NEWSLETTER_CRON_SECRET/);
    expect(() => loadConfig(partial)).toThrowError(/PUBLIC_BASE_URL/);
    expect(() => loadConfig(partial)).toThrowError(/OVERSEERR_URL/);
  });
});

describe('optional files/download config', () => {
  const { FILES_ROOT_PATH, DOWNLOAD_SIGNING_SECRET, ...ENV_WITHOUT_FILES } = VALID_ENV;

  it('does not throw when FILES_ROOT_PATH and DOWNLOAD_SIGNING_SECRET are absent', () => {
    expect(() => loadConfig(ENV_WITHOUT_FILES)).not.toThrow();
  });

  it('sets filesRootPath and downloadSigningSecret to null when absent', () => {
    const config = loadConfig(ENV_WITHOUT_FILES);
    expect(config.filesRootPath).toBeNull();
    expect(config.downloadSigningSecret).toBeNull();
  });

  it('still sets filesRootPath and downloadSigningSecret when present', () => {
    const config = loadConfig(VALID_ENV);
    expect(config.filesRootPath).toBe('/mnt/qnap-software');
    expect(config.downloadSigningSecret).toBe('a-long-random-signing-secret');
  });

  it('sets downloadProxyUrl to null when DOWNLOAD_PROXY_URL is not set', () => {
    expect(loadConfig(VALID_ENV).downloadProxyUrl).toBeNull();
  });

  it('sets downloadProxyUrl when DOWNLOAD_PROXY_URL is set', () => {
    const config = loadConfig({ ...VALID_ENV, DOWNLOAD_PROXY_URL: 'https://dl.example.com' });
    expect(config.downloadProxyUrl).toBe('https://dl.example.com');
  });
});

describe('shortcuts', () => {
  it('is empty when no SHORTCUT_* vars are set', () => {
    expect(loadConfig(VALID_ENV).shortcuts).toEqual([]);
  });

  it('includes a shortcut when its _URL is set, with a null iconUrl if _ICON_URL is absent', () => {
    const config = loadConfig({ ...VALID_ENV, SHORTCUT_PLEX_URL: 'https://plex.example.com' });
    expect(config.shortcuts).toEqual([{ name: 'Plex', url: 'https://plex.example.com', iconUrl: null }]);
  });

  it('includes iconUrl when both _URL and _ICON_URL are set', () => {
    const config = loadConfig({
      ...VALID_ENV,
      SHORTCUT_POSTERR_URL: 'https://posterr.example.com',
      SHORTCUT_POSTERR_ICON_URL: 'https://posterr.example.com/favicons/favicon.ico',
    });
    expect(config.shortcuts).toEqual([
      { name: 'Posterr', url: 'https://posterr.example.com', iconUrl: 'https://posterr.example.com/favicons/favicon.ico' },
    ]);
  });

  it('omits a shortcut entirely when only _ICON_URL is set without _URL', () => {
    const config = loadConfig({ ...VALID_ENV, SHORTCUT_PLEX_ICON_URL: 'https://plex.example.com/favicon.ico' });
    expect(config.shortcuts).toEqual([]);
  });

  it('preserves the fixed display order regardless of env var declaration order', () => {
    const config = loadConfig({
      ...VALID_ENV,
      SHORTCUT_PLEX_REWIND_URL: 'https://rewind.example.com',
      SHORTCUT_PLEX_URL: 'https://plex.example.com',
    });
    expect(config.shortcuts.map((s) => s.name)).toEqual(['Plex', 'Plex Rewind']);
  });
});

describe('storageVolumes', () => {
  it('is empty when STORAGE_VOLUMES is not set', () => {
    expect(loadConfig(VALID_ENV).storageVolumes).toEqual([]);
  });

  it('parses a valid STORAGE_VOLUMES JSON array', () => {
    const config = loadConfig({
      ...VALID_ENV,
      STORAGE_VOLUMES: JSON.stringify([{ name: 'NAS', path: '/mnt/nas' }]),
    });
    expect(config.storageVolumes).toEqual([{ name: 'NAS', path: '/mnt/nas' }]);
  });

  it('is empty (not throwing) when STORAGE_VOLUMES is invalid JSON', () => {
    expect(loadConfig({ ...VALID_ENV, STORAGE_VOLUMES: '{not json' }).storageVolumes).toEqual([]);
  });

  it('is empty when STORAGE_VOLUMES is valid JSON but not an array', () => {
    expect(loadConfig({ ...VALID_ENV, STORAGE_VOLUMES: '{"name":"NAS"}' }).storageVolumes).toEqual([]);
  });

  it('drops entries missing name or path instead of throwing', () => {
    const config = loadConfig({
      ...VALID_ENV,
      STORAGE_VOLUMES: JSON.stringify([{ name: 'NAS', path: '/mnt/nas' }, { name: 'Bad' }]),
    });
    expect(config.storageVolumes).toEqual([{ name: 'NAS', path: '/mnt/nas' }]);
  });
});
