import { describe, it, expect, beforeEach } from 'vitest';
import { getDb, resetDbForTests } from '../../src/lib/db';
import { setSetting } from '../../src/lib/settings';
import {
  loadConfig,
  isSetupComplete,
  assertConfigured,
  getConfigSources,
} from '../../src/lib/config';

const FULL_ENV = {
  NODE_ENV: 'test' as const,
  DATABASE_PATH: ':memory:',
  SESSION_SECRET: 'test-secret-at-least-32-characters-long',
  PUBLIC_BASE_URL: 'https://portal.example.com',
  PLEX_URL: 'https://plex.example.com',
  PLEX_SERVER_TOKEN: 'token',
  PLEX_SERVER_NAME: 'My Plex Server',
  TAUTULLI_URL: 'https://tautulli.example.com',
  TAUTULLI_API_KEY: 'tkey',
  SONARR_URL: 'https://sonarr.example.com',
  SONARR_API_KEY: 'skey',
  RADARR_URL: 'https://radarr.example.com',
  RADARR_API_KEY: 'rkey',
  OVERSEERR_URL: 'https://overseerr.example.com',
  OVERSEERR_API_KEY: 'overseerr-key',
  SMTP_HOST: 'mail.example.com',
  SMTP_PORT: '465',
  SMTP_USER: 'smtpuser',
  SMTP_PASS: 'smtppass',
  MAIL_FROM_ADDRESS: 'admin@example.com',
  MAIL_FROM_NAME: 'Portarr',
};

// Minimal env that still satisfies the required SESSION_SECRET, for tests
// that otherwise want everything else unset/partial.
const MINIMAL_ENV = {
  NODE_ENV: 'test' as const,
  DATABASE_PATH: ':memory:',
  SESSION_SECRET: 'test-secret-at-least-32-characters-long',
};

describe('loadConfig — fully configured via env (backwards compat)', () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it('returns non-null service configs for every in-scope field when env has them all', () => {
    const db = getDb(':memory:');
    const config = loadConfig(FULL_ENV, db);
    expect(config.plex).toEqual({
      url: 'https://plex.example.com',
      serverToken: 'token',
      serverName: 'My Plex Server',
      clientIdentifier: expect.any(String),
    });
    expect(config.tautulli).toEqual({ url: 'https://tautulli.example.com', apiKey: 'tkey' });
    expect(config.sonarr).toEqual({ url: 'https://sonarr.example.com', apiKey: 'skey' });
    expect(config.radarr).toEqual({ url: 'https://radarr.example.com', apiKey: 'rkey' });
    expect(config.overseerr).toEqual({ url: 'https://overseerr.example.com', apiKey: 'overseerr-key' });
    expect(config.smtp).toEqual({
      host: 'mail.example.com',
      port: '465',
      user: 'smtpuser',
      pass: 'smtppass',
      fromAddress: 'admin@example.com',
      fromName: 'Portarr',
    });
    expect(config.publicBaseUrl).toBe('https://portal.example.com');
  });

  it('isSetupComplete is true', () => {
    const db = getDb(':memory:');
    expect(isSetupComplete(loadConfig(FULL_ENV, db))).toBe(true);
  });

  it('assertConfigured does not throw and narrows every service to non-null', () => {
    const db = getDb(':memory:');
    const config = assertConfigured(loadConfig(FULL_ENV, db));
    expect(config.plex.url).toBe('https://plex.example.com');
  });

  it('auto-generates PLEX_CLIENT_IDENTIFIER/NEWSLETTER_CRON_SECRET/DOWNLOAD_SIGNING_SECRET when absent from env, and they are stable across two loadConfig calls', () => {
    const db = getDb(':memory:');
    const first = loadConfig(FULL_ENV, db);
    const second = loadConfig(FULL_ENV, db);
    expect(first.plex?.clientIdentifier).toBe(second.plex?.clientIdentifier);
    expect(first.newsletterCronSecret).toBe(second.newsletterCronSecret);
    expect(first.downloadSigningSecret).toBe(second.downloadSigningSecret);
  });

  it('uses SESSION_SECRET straight from env (never auto-generated/DB-backed)', () => {
    const db = getDb(':memory:');
    const config = loadConfig(FULL_ENV, db);
    expect(config.session.secret).toBe(FULL_ENV.SESSION_SECRET);
  });

  it('throws when SESSION_SECRET is absent from env', () => {
    const db = getDb(':memory:');
    const { SESSION_SECRET, ...envWithoutSecret } = FULL_ENV;
    expect(() => loadConfig(envWithoutSecret, db)).toThrow(/SESSION_SECRET/);
  });
});

describe('loadConfig — nothing configured', () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it('every in-scope service is null, publicBaseUrl is null, isSetupComplete is false', () => {
    const db = getDb(':memory:');
    const config = loadConfig(MINIMAL_ENV, db);
    expect(config.plex).toBeNull();
    expect(config.tautulli).toBeNull();
    expect(config.sonarr).toBeNull();
    expect(config.radarr).toBeNull();
    expect(config.overseerr).toBeNull();
    expect(config.smtp).toBeNull();
    expect(config.publicBaseUrl).toBeNull();
    expect(isSetupComplete(config)).toBe(false);
  });

  it('assertConfigured throws', () => {
    const db = getDb(':memory:');
    const config = loadConfig(MINIMAL_ENV, db);
    expect(() => assertConfigured(config)).toThrow();
  });

  it('a partially-filled service (missing one required field) stays null', () => {
    const db = getDb(':memory:');
    const config = loadConfig(
      { ...MINIMAL_ENV, PLEX_URL: 'https://plex.example.com', PLEX_SERVER_TOKEN: 'token' },
      db
    );
    expect(config.plex).toBeNull();
  });
});

describe('loadConfig — DB-stored settings fill in for unset env vars', () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it('reads Plex config from the settings table when env is empty', () => {
    const db = getDb(':memory:');
    setSetting(db, 'PLEX_URL', 'https://plex.fromdb.example.com');
    setSetting(db, 'PLEX_SERVER_TOKEN', 'db-token');
    setSetting(db, 'PLEX_SERVER_NAME', 'DB Server');
    const config = loadConfig(MINIMAL_ENV, db);
    expect(config.plex).toEqual({
      url: 'https://plex.fromdb.example.com',
      serverToken: 'db-token',
      serverName: 'DB Server',
      clientIdentifier: expect.any(String),
    });
  });

  it('env wins over a DB value for the same key', () => {
    const db = getDb(':memory:');
    setSetting(db, 'PLEX_URL', 'https://plex.fromdb.example.com');
    const config = loadConfig({ ...MINIMAL_ENV, PLEX_URL: 'https://plex.fromenv.example.com' }, db);
    expect(config.plex).toBeNull(); // env alone still leaves serverToken/serverName unset
  });
});

describe('getConfigSources', () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it('reports "env" for a key set via env, "db" for a key only in settings, "unset" for neither', () => {
    const db = getDb(':memory:');
    setSetting(db, 'TAUTULLI_URL', 'https://tautulli.fromdb.example.com');
    const sources = getConfigSources({ NODE_ENV: 'test' as const, PLEX_URL: 'https://plex.example.com' }, db);
    expect(sources.PLEX_URL).toBe('env');
    expect(sources.TAUTULLI_URL).toBe('db');
    expect(sources.SONARR_URL).toBe('unset');
  });
});
