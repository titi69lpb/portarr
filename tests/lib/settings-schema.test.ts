import { describe, it, expect } from 'vitest';
import { SERVICE_FIELDS } from '../../src/lib/settings-schema';

describe('SERVICE_FIELDS', () => {
  it('jellyfin needs a url (text) and an api key (password)', () => {
    expect(SERVICE_FIELDS.jellyfin.map((f) => [f.envKey, f.type])).toEqual([
      ['JELLYFIN_URL', 'text'],
      ['JELLYFIN_API_KEY', 'password'],
    ]);
  });

  it('plex requires url, server token, and server name', () => {
    const keys = SERVICE_FIELDS.plex.map((f) => f.envKey);
    expect(keys).toEqual(['PLEX_URL', 'PLEX_SERVER_TOKEN', 'PLEX_SERVER_NAME']);
  });

  it('smtp requires all 6 mail fields', () => {
    const keys = SERVICE_FIELDS.smtp.map((f) => f.envKey);
    expect(keys).toEqual([
      'SMTP_HOST',
      'SMTP_PORT',
      'SMTP_USER',
      'SMTP_PASS',
      'MAIL_FROM_ADDRESS',
      'MAIL_FROM_NAME',
    ]);
  });

  it('publicBaseUrl has PUBLIC_BASE_URL and PUBLIC_COMMUNITY_NAME', () => {
    expect(SERVICE_FIELDS.publicBaseUrl.map((f) => f.envKey)).toEqual(['PUBLIC_BASE_URL', 'PUBLIC_COMMUNITY_NAME']);
    expect(SERVICE_FIELDS.publicBaseUrl.map((f) => f.type)).toEqual(['text', 'text']);
  });

  it('marks API keys and passwords as type "password", URLs and names as "text"', () => {
    expect(SERVICE_FIELDS.plex.find((f) => f.envKey === 'PLEX_SERVER_TOKEN')?.type).toBe('password');
    expect(SERVICE_FIELDS.plex.find((f) => f.envKey === 'PLEX_URL')?.type).toBe('text');
    expect(SERVICE_FIELDS.smtp.find((f) => f.envKey === 'SMTP_PASS')?.type).toBe('password');
  });

  it('covers exactly the 10 configurable groups', () => {
    expect(Object.keys(SERVICE_FIELDS).sort()).toEqual(
      ['jellyfin', 'jellyfinActivitySource', 'jellystat', 'overseerr', 'plex', 'publicBaseUrl', 'radarr', 'smtp', 'sonarr', 'tautulli'].sort()
    );
  });

  it('jellystat needs a url (text) and an api key (password)', () => {
    expect(SERVICE_FIELDS.jellystat.map((f) => [f.envKey, f.type])).toEqual([
      ['JELLYSTAT_URL', 'text'],
      ['JELLYSTAT_API_KEY', 'password'],
    ]);
  });

  it('jellyfinActivitySource is a select with native and jellystat options', () => {
    expect(SERVICE_FIELDS.jellyfinActivitySource).toEqual([
      {
        envKey: 'JELLYFIN_ACTIVITY_SOURCE',
        label: "Source d'activité Jellyfin",
        type: 'select',
        options: [
          { value: 'native', label: 'Natif (lecture en cours uniquement)' },
          { value: 'jellystat', label: 'Jellystat (statistiques et historique complets)' },
        ],
      },
    ]);
  });
});
