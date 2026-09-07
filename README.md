# Portarr

A self-hosted user portal for your Plex server. Dashboard with recently-added carousels, now-playing, upcoming releases (Sonarr/Radarr), Overseerr request tracking, Tautulli stats (server-wide and per-user), a searchable watch history, global search with deep links into Plex Web, an optional read-only file browser with download support, admin-managed announcements, and an admin mailing system (broadcast + templates + an automated "what's new" newsletter).

Built for a small/medium Plex community that wants something friendlier than raw Plex/Tautulli/Overseerr links, without standing up a full media-management dashboard.

## Status

Extracted from a private, actively-run instance and published as a standalone open-source project. Every hardcoded, deployment-specific value (server URLs, sidebar shortcuts, storage paths, a WireGuard-bypass download proxy) has been made configurable via environment variables — see [Configuration](#configuration) below. Optional features (the file browser, storage widget, download proxy, sidebar shortcuts) simply don't render when their variables are unset, so a minimal deploy only needs the required set.

## Features

- **Plex SSO login** — OAuth PIN flow, no separate account system. Access is restricted to accounts your Plex server actually shares with.
- **Dashboard** — recently-added movies/shows in an animated poster carousel (each card links to its Plex Web detail page), a release calendar sourced from Sonarr/Radarr, "Now Playing" from Tautulli, pending Overseerr requests, server-wide and personal Tautulli stats, personal watch history, and an optional storage-usage widget.
- **Global search** — searches your Plex library and links straight into Plex Web.
- **File browser** *(optional)* — read-only navigation of a mounted directory, with signed-URL downloads. Works standalone (serves files directly, with HTTP Range/resume support) or can redirect to a separate proxy service for networks where the app server shouldn't be in the download path.
- **Announcements** — an admin-managed banner on the dashboard, no redeploy needed to change it.
- **Mailing** — broadcast emails to your user base (by activity group or hand-picked), reusable Markdown templates, a required test-send before any mass send.
- **Newsletter** — an automated "what's new" recap of recently-added content, opt-in/opt-out per user, a public web archive, cron-triggered or manual.
- **Availability notifications** — emails a user automatically when their approved Overseerr request becomes available.
- **Admin panel** — announcements, mail templates + send history, a members view cross-referenced with Tautulli activity and newsletter opt-in status, manual Plex user sync, storage usage.

## Stack

Next.js 14 (App Router, TypeScript) · SQLite (`better-sqlite3`) · Docker

## Requirements

- A Plex Media Server, with an API token for an account that can see your library and shared users.
- Sonarr and Radarr instances (used for the upcoming-releases calendar).
- Tautulli (used for now-playing and stats).
- Overseerr (used for request tracking).
- An SMTP account (used for mailing/newsletter/notifications).
- Node.js 20+ (for local dev) or Docker (for deployment).

## Configuration

Copy `.env.example` to `.env.local` (dev) or `.env` (Docker) and fill it in. Every variable below marked **required** must be set or the app refuses to start with a clear error listing exactly what's missing; everything marked **optional** can be left unset and the app runs fine — the feature it powers just doesn't appear.

| Variable | Required | Unlocks |
|---|---|---|
| `DATABASE_PATH` | ✅ | SQLite file location |
| `SESSION_SECRET` | ✅ | Session cookie signing (32+ random chars) |
| `PLEX_URL`, `PLEX_SERVER_TOKEN`, `PLEX_SERVER_NAME`, `PLEX_CLIENT_IDENTIFIER` | ✅ | Plex API access + login |
| `TAUTULLI_URL`, `TAUTULLI_API_KEY` | ✅ | Now-playing, stats |
| `SONARR_URL`, `SONARR_API_KEY` | ✅ | Release calendar (TV) |
| `RADARR_URL`, `RADARR_API_KEY` | ✅ | Release calendar (movies) |
| `OVERSEERR_URL`, `OVERSEERR_API_KEY` | ✅ | Pending requests, availability notifications |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME` | ✅ | Mailing, newsletter, availability notifications |
| `NEWSLETTER_CRON_SECRET` | ✅ | Auth for the newsletter/notification cron endpoints |
| `PUBLIC_BASE_URL` | ✅ | Absolute links in outgoing emails |
| `SHORTCUT_<NAME>_URL` / `SHORTCUT_<NAME>_ICON_URL` (×6: `PLEX`, `OVERSEERR`, `TAUTULLI`, `WIZARR`, `POSTERR`, `PLEX_REWIND`) | optional | A sidebar shortcut link, one per pair set. Both vars must be set for an icon to show; a shortcut with only `_URL` renders as a text-only link. Absent entirely = that shortcut just isn't in the sidebar. |
| `FILES_ROOT_PATH` | optional | The `/files` page, the sidebar "Files" link, and the download route |
| `FS_TIMEOUT_MS` | optional | Timeout (ms) for filesystem calls against the mount — defaults to `5000` |
| `DOWNLOAD_SIGNING_SECRET` | optional | Required only alongside `DOWNLOAD_PROXY_URL` — signs redirect URLs |
| `DOWNLOAD_PROXY_URL` | optional | Redirects downloads to a separate proxy instead of streaming through this app — see [Download proxy](#download-proxy-optional) |
| `STORAGE_VOLUMES` | optional | JSON array (`[{"name":"...","path":"..."}]`) of mounted volumes to show as usage bars on `/admin` |
| `KUMA_URL`, `KUMA_API_KEY` | optional | An "all up" / "N down" status badge on the dashboard, backed by [Uptime Kuma](https://github.com/louislam/uptime-kuma) |

Full reference with inline comments: [`.env.example`](.env.example).

## Run locally

```bash
cp .env.example .env.local   # fill in real values
npm install
npm run dev
```

## Tests & build

```bash
npm test         # vitest run
npm run typecheck  # tsc --noEmit
npm run build     # next build — catches classes of bug vitest/tsc miss (route handlers, Server/Client Component boundaries)
```

## Deploy (Docker)

```bash
docker build -t portarr .
docker run -d \
  --name portarr \
  --env-file .env \
  -e HOSTNAME=0.0.0.0 \
  -v $(pwd)/data:/app/data \
  -p 3000:3000 \
  portarr
```

`HOSTNAME=0.0.0.0` is required — without it, the Next.js standalone server binds to the container's internal IP and its own internal API self-fetches (used by a couple of routes) break.

Put a reverse proxy (Traefik, Caddy, nginx...) in front for TLS; the app itself only speaks plain HTTP on port 3000.

### Mount a file browser directory (optional)

If you set `FILES_ROOT_PATH`, mount the directory it points to read-only into the container at that same path, e.g.:

```bash
-v /path/on/host:/mnt/shared-storage:ro
```

### Download proxy (optional)

By default, when `FILES_ROOT_PATH` is set and `DOWNLOAD_PROXY_URL` is not, the app serves file downloads itself (with HTTP Range support for resumable downloads). If your deployment puts the app behind a slow or tunneled network path to the storage mount, you can run a separate lightweight proxy service on a machine with direct access to the storage and point `DOWNLOAD_PROXY_URL` at it — the app then signs a short-lived URL (HMAC-SHA256, `DOWNLOAD_SIGNING_SECRET` shared between both services) and redirects there instead of streaming the file itself.

### Cron jobs (optional)

Newsletter (adjust the schedule to taste):

```cron
0 14 * * 5 curl -s -X POST -H "x-newsletter-secret: $NEWSLETTER_CRON_SECRET" https://your-domain.example.com/api/admin/newsletter/send
```

Availability notifications (checks approved-but-not-yet-available Overseerr requests):

```cron
*/15 * * * * curl -s -X POST -H "x-cron-secret: $NEWSLETTER_CRON_SECRET" https://your-domain.example.com/api/cron/request-availability
```

Both reuse `NEWSLETTER_CRON_SECRET` rather than needing a dedicated secret.

## License

MIT — see [LICENSE](LICENSE).
