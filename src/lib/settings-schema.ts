export type ServiceKey =
  | 'publicBaseUrl'
  | 'plex'
  | 'tautulli'
  | 'sonarr'
  | 'radarr'
  | 'overseerr'
  | 'smtp';

export interface FieldDef {
  envKey: string;
  label: string;
  type: 'text' | 'password';
}

export const SERVICE_FIELDS: Record<ServiceKey, FieldDef[]> = {
  publicBaseUrl: [
    { envKey: 'PUBLIC_BASE_URL', label: 'URL publique de Portarr (ex. https://portarr.example.com)', type: 'text' },
  ],
  plex: [
    { envKey: 'PLEX_URL', label: 'URL du serveur Plex', type: 'text' },
    { envKey: 'PLEX_SERVER_TOKEN', label: 'Jeton serveur Plex', type: 'password' },
    { envKey: 'PLEX_SERVER_NAME', label: 'Nom du serveur (tel qu\'affiché sur plex.tv)', type: 'text' },
  ],
  tautulli: [
    { envKey: 'TAUTULLI_URL', label: 'URL Tautulli', type: 'text' },
    { envKey: 'TAUTULLI_API_KEY', label: 'Clé API Tautulli', type: 'password' },
  ],
  sonarr: [
    { envKey: 'SONARR_URL', label: 'URL Sonarr', type: 'text' },
    { envKey: 'SONARR_API_KEY', label: 'Clé API Sonarr', type: 'password' },
  ],
  radarr: [
    { envKey: 'RADARR_URL', label: 'URL Radarr', type: 'text' },
    { envKey: 'RADARR_API_KEY', label: 'Clé API Radarr', type: 'password' },
  ],
  overseerr: [
    { envKey: 'OVERSEERR_URL', label: 'URL Overseerr', type: 'text' },
    { envKey: 'OVERSEERR_API_KEY', label: 'Clé API Overseerr', type: 'password' },
  ],
  smtp: [
    { envKey: 'SMTP_HOST', label: 'Hôte SMTP', type: 'text' },
    { envKey: 'SMTP_PORT', label: 'Port SMTP', type: 'text' },
    { envKey: 'SMTP_USER', label: 'Utilisateur SMTP', type: 'text' },
    { envKey: 'SMTP_PASS', label: 'Mot de passe SMTP', type: 'password' },
    { envKey: 'MAIL_FROM_ADDRESS', label: 'Adresse d\'expédition', type: 'text' },
    { envKey: 'MAIL_FROM_NAME', label: 'Nom d\'expédition', type: 'text' },
  ],
};
