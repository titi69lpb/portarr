// Shared timeout for every upstream call (Plex, Tautulli, Sonarr/Radarr,
// Overseerr). Without one, a hung upstream — plausible on this infra given
// WireGuard tunnels and CIFS-backed storage — hangs the dashboard's
// Promise.all and the page never renders at all.
export const DEFAULT_UPSTREAM_TIMEOUT_MS = 5000;

export function timeoutSignal(ms: number = DEFAULT_UPSTREAM_TIMEOUT_MS): AbortSignal {
  return AbortSignal.timeout(ms);
}
