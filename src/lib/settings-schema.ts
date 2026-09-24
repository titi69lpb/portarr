import type { Locale } from './i18n/dictionaries';
import { t } from './i18n/translate';

export type ServiceKey =
  | 'publicBaseUrl'
  | 'plex'
  | 'tautulli'
  | 'jellyfin'
  | 'jellystat'
  | 'jellyfinActivitySource'
  | 'sonarr'
  | 'radarr'
  | 'overseerr'
  | 'smtp';

export interface FieldDef {
  envKey: string;
  // i18n key under settings.fields.* (resolve with fieldLabel).
  label: string;
  type: 'text' | 'password' | 'select';
  // label is an i18n key under settings.options.* (resolve with optionLabel).
  options?: { value: string; label: string }[];
  optional?: boolean;
}

export const SERVICE_FIELDS: Record<ServiceKey, FieldDef[]> = {
  publicBaseUrl: [
    { envKey: 'PUBLIC_BASE_URL', label: 'settings.fields.PUBLIC_BASE_URL', type: 'text' },
    {
      envKey: 'PUBLIC_COMMUNITY_NAME',
      label: 'settings.fields.PUBLIC_COMMUNITY_NAME',
      type: 'text',
      optional: true,
    },
  ],
  plex: [
    { envKey: 'PLEX_URL', label: 'settings.fields.PLEX_URL', type: 'text' },
    { envKey: 'PLEX_SERVER_TOKEN', label: 'settings.fields.PLEX_SERVER_TOKEN', type: 'password' },
    { envKey: 'PLEX_SERVER_NAME', label: 'settings.fields.PLEX_SERVER_NAME', type: 'text' },
  ],
  tautulli: [
    { envKey: 'TAUTULLI_URL', label: 'settings.fields.TAUTULLI_URL', type: 'text' },
    { envKey: 'TAUTULLI_API_KEY', label: 'settings.fields.TAUTULLI_API_KEY', type: 'password' },
  ],
  jellyfin: [
    { envKey: 'JELLYFIN_URL', label: 'settings.fields.JELLYFIN_URL', type: 'text' },
    { envKey: 'JELLYFIN_API_KEY', label: 'settings.fields.JELLYFIN_API_KEY', type: 'password' },
  ],
  jellystat: [
    { envKey: 'JELLYSTAT_URL', label: 'settings.fields.JELLYSTAT_URL', type: 'text' },
    { envKey: 'JELLYSTAT_API_KEY', label: 'settings.fields.JELLYSTAT_API_KEY', type: 'password' },
  ],
  jellyfinActivitySource: [
    {
      envKey: 'JELLYFIN_ACTIVITY_SOURCE',
      label: 'settings.fields.JELLYFIN_ACTIVITY_SOURCE',
      type: 'select',
      options: [
        { value: 'native', label: 'settings.options.native' },
        { value: 'jellystat', label: 'settings.options.jellystat' },
      ],
    },
  ],
  sonarr: [
    { envKey: 'SONARR_URL', label: 'settings.fields.SONARR_URL', type: 'text' },
    { envKey: 'SONARR_API_KEY', label: 'settings.fields.SONARR_API_KEY', type: 'password' },
  ],
  radarr: [
    { envKey: 'RADARR_URL', label: 'settings.fields.RADARR_URL', type: 'text' },
    { envKey: 'RADARR_API_KEY', label: 'settings.fields.RADARR_API_KEY', type: 'password' },
  ],
  overseerr: [
    { envKey: 'OVERSEERR_URL', label: 'settings.fields.OVERSEERR_URL', type: 'text' },
    { envKey: 'OVERSEERR_API_KEY', label: 'settings.fields.OVERSEERR_API_KEY', type: 'password' },
  ],
  smtp: [
    { envKey: 'SMTP_HOST', label: 'settings.fields.SMTP_HOST', type: 'text' },
    { envKey: 'SMTP_PORT', label: 'settings.fields.SMTP_PORT', type: 'text' },
    { envKey: 'SMTP_USER', label: 'settings.fields.SMTP_USER', type: 'text' },
    { envKey: 'SMTP_PASS', label: 'settings.fields.SMTP_PASS', type: 'password' },
    { envKey: 'MAIL_FROM_ADDRESS', label: 'settings.fields.MAIL_FROM_ADDRESS', type: 'text' },
    { envKey: 'MAIL_FROM_NAME', label: 'settings.fields.MAIL_FROM_NAME', type: 'text' },
  ],
};

export function fieldLabel(locale: Locale, def: FieldDef): string {
  return t(locale, def.label);
}

export function optionLabel(locale: Locale, option: { label: string }): string {
  return t(locale, option.label);
}
