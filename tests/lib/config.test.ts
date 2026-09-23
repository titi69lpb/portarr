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
    expect(config.plex?.url).toBe('https://plex.example.com');
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

const JELLYFIN_ONLY_ENV = {
  NODE_ENV: 'test' as const,
  DATABASE_PATH: ':memory:',
  SESSION_SECRET: 'test-secret-at-least-32-characters-long',
  PUBLIC_BASE_URL: 'https://portal.example.com',
  JELLYFIN_URL: 'https://jellyfin.example.com',
  JELLYFIN_API_KEY: 'jfkey',
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

describe('isSetupComplete — Jellyfin-only installs (sub-project 3b)', () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it('is true with only Jellyfin configured, no Plex, no Tautulli', () => {
    const config = loadConfig(JELLYFIN_ONLY_ENV, getDb(':memory:'));
    expect(config.plex).toBeNull();
    expect(config.tautulli).toBeNull();
    expect(isSetupComplete(config)).toBe(true);
  });

  it('is false with neither Plex+Tautulli nor Jellyfin configured', () => {
    const { JELLYFIN_URL, JELLYFIN_API_KEY, ...rest } = JELLYFIN_ONLY_ENV;
    const config = loadConfig(rest, getDb(':memory:'));
    expect(isSetupComplete(config)).toBe(false);
  });

  it('is still true with only Plex+Tautulli configured (backwards compat, no Jellyfin)', () => {
    const config = loadConfig(FULL_ENV, getDb(':memory:'));
    expect(isSetupComplete(config)).toBe(true);
  });

  it('assertConfigured no longer throws for a Jellyfin-only install, and plex/tautulli stay null', () => {
    const config = assertConfigured(loadConfig(JELLYFIN_ONLY_ENV, getDb(':memory:')));
    expect(config.plex).toBeNull();
    expect(config.tautulli).toBeNull();
  });
});

describe('communityName', () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it('uses PUBLIC_COMMUNITY_NAME when set', () => {
    const config = loadConfig({ ...FULL_ENV, PUBLIC_COMMUNITY_NAME: 'The Crew' }, getDb(':memory:'));
    expect(config.communityName).toBe('The Crew');
  });

  it('falls back to PLEX_SERVER_NAME when PUBLIC_COMMUNITY_NAME is unset', () => {
    const config = loadConfig(FULL_ENV, getDb(':memory:'));
    expect(config.communityName).toBe('My Plex Server');
  });

  it('falls back to "Portarr" when neither is set', () => {
    const config = loadConfig(JELLYFIN_ONLY_ENV, getDb(':memory:'));
    expect(config.communityName).toBe('Portarr');
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

describe('isSetupComplete — a media provider must be active', () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it('is false when Tautulli is missing (Plex alone is not an active provider)', () => {
    const { TAUTULLI_URL: _url, TAUTULLI_API_KEY: _key, ...env } = FULL_ENV;
    expect(isSetupComplete(loadConfig(env, getDb(':memory:')))).toBe(false);
  });

  it('is false when Plex is missing', () => {
    const { PLEX_URL: _url, ...env } = FULL_ENV;
    expect(isSetupComplete(loadConfig(env, getDb(':memory:')))).toBe(false);
  });

  it('is true when a provider is active and every other service is configured', () => {
    expect(isSetupComplete(loadConfig(FULL_ENV, getDb(':memory:')))).toBe(true);
  });

  // Jellyfin stands on its own as an active provider (sub-project 3b relaxed isSetupComplete
  // to drop the hard Plex+Tautulli requirement), so these two are now true rather than false —
  // updated in Task 1 of sub-project 3b alongside the isSetupComplete/ConfiguredAppConfig change
  // that makes them true. Covered in more depth by the dedicated
  // "isSetupComplete — Jellyfin-only installs (sub-project 3b)" describe block above.
  it('is true for a Jellyfin-only install without Plex (assertConfigured hands out a null plex)', () => {
    const { PLEX_URL: _url, ...env } = FULL_ENV;
    const config = loadConfig(
      { ...env, JELLYFIN_URL: 'http://j.local:8096', JELLYFIN_API_KEY: 'jkey' },
      getDb(':memory:')
    );
    expect(config.jellyfin).not.toBeNull();
    expect(isSetupComplete(config)).toBe(true);
    expect(() => assertConfigured(config)).not.toThrow();
  });

  it('is true for Jellyfin + Plex without Tautulli (Jellyfin alone is enough)', () => {
    const { TAUTULLI_URL: _url, ...env } = FULL_ENV;
    const config = loadConfig(
      { ...env, JELLYFIN_URL: 'http://j.local:8096', JELLYFIN_API_KEY: 'jkey' },
      getDb(':memory:')
    );
    expect(config.jellyfin).not.toBeNull();
    expect(isSetupComplete(config)).toBe(true);
  });
});

describe('jellyfin config', () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it('is null when JELLYFIN_URL or JELLYFIN_API_KEY is missing', () => {
    expect(loadConfig(FULL_ENV, getDb(':memory:')).jellyfin).toBeNull();
    resetDbForTests();
    expect(loadConfig({ ...FULL_ENV, JELLYFIN_URL: 'http://j.local:8096' }, getDb(':memory:')).jellyfin).toBeNull();
  });

  it('is loaded from env with the trailing slash trimmed', () => {
    const config = loadConfig(
      { ...FULL_ENV, JELLYFIN_URL: 'http://j.local:8096/', JELLYFIN_API_KEY: 'key123' },
      getDb(':memory:')
    );
    expect(config.jellyfin).toEqual({ url: 'http://j.local:8096', apiKey: 'key123' });
  });

  it('never changes isSetupComplete (Jellyfin is optional)', () => {
    const withJellyfin = loadConfig(
      { ...FULL_ENV, JELLYFIN_URL: 'http://j.local:8096', JELLYFIN_API_KEY: 'key123' },
      getDb(':memory:')
    );
    expect(isSetupComplete(withJellyfin)).toBe(true);
    resetDbForTests();
    expect(isSetupComplete(loadConfig(FULL_ENV, getDb(':memory:')))).toBe(true);
  });

  it('reports the source of the jellyfin keys', () => {
    const db = getDb(':memory:');
    const sources = getConfigSources({ ...FULL_ENV, JELLYFIN_URL: 'http://j.local:8096' }, db);
    expect(sources.JELLYFIN_URL).toBe('env');
    expect(sources.JELLYFIN_API_KEY).toBe('unset');
  });
});

describe('jellystat and activity-source config', () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it('jellystat is null when either field is missing', () => {
    expect(loadConfig(FULL_ENV, getDb(':memory:')).jellystat).toBeNull();
    resetDbForTests();
    expect(loadConfig({ ...FULL_ENV, JELLYSTAT_URL: 'http://js.local:3000' }, getDb(':memory:')).jellystat).toBeNull();
  });

  it('jellystat is loaded from env', () => {
    const config = loadConfig({ ...FULL_ENV, JELLYSTAT_URL: 'http://js.local:3000', JELLYSTAT_API_KEY: 'key' }, getDb(':memory:'));
    expect(config.jellystat).toEqual({ url: 'http://js.local:3000', apiKey: 'key' });
  });

  it('jellyfinActivitySource defaults to native and accepts jellystat', () => {
    expect(loadConfig(FULL_ENV, getDb(':memory:')).jellyfinActivitySource).toBe('native');
    resetDbForTests();
    expect(loadConfig({ ...FULL_ENV, JELLYFIN_ACTIVITY_SOURCE: 'jellystat' }, getDb(':memory:')).jellyfinActivitySource).toBe('jellystat');
  });

  it('an unrecognized jellyfinActivitySource value falls back to native', () => {
    expect(loadConfig({ ...FULL_ENV, JELLYFIN_ACTIVITY_SOURCE: 'bogus' }, getDb(':memory:')).jellyfinActivitySource).toBe('native');
  });

  it('never changes isSetupComplete', () => {
    const config = loadConfig({ ...FULL_ENV, JELLYSTAT_URL: 'http://js.local:3000', JELLYSTAT_API_KEY: 'key', JELLYFIN_ACTIVITY_SOURCE: 'jellystat' }, getDb(':memory:'));
    expect(isSetupComplete(config)).toBe(true);
  });
});
