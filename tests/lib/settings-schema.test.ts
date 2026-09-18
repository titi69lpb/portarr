import { describe, it, expect } from 'vitest';
import { SERVICE_FIELDS } from '../../src/lib/settings-schema';

describe('SERVICE_FIELDS', () => {
  it('covers exactly the 7 configurable groups', () => {
    expect(Object.keys(SERVICE_FIELDS).sort()).toEqual(
      ['overseerr', 'plex', 'publicBaseUrl', 'radarr', 'smtp', 'sonarr', 'tautulli'].sort()
    );
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

  it('publicBaseUrl has exactly one field', () => {
    expect(SERVICE_FIELDS.publicBaseUrl).toHaveLength(1);
    expect(SERVICE_FIELDS.publicBaseUrl[0].envKey).toBe('PUBLIC_BASE_URL');
  });

  it('marks API keys and passwords as type "password", URLs and names as "text"', () => {
    expect(SERVICE_FIELDS.plex.find((f) => f.envKey === 'PLEX_SERVER_TOKEN')?.type).toBe('password');
    expect(SERVICE_FIELDS.plex.find((f) => f.envKey === 'PLEX_URL')?.type).toBe('text');
    expect(SERVICE_FIELDS.smtp.find((f) => f.envKey === 'SMTP_PASS')?.type).toBe('password');
  });
});
