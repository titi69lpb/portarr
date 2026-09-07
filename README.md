<div align="center">
  <img src="docs/screenshots/logo-full.jpg" alt="Portarr" width="360">

  <h3>A lightweight, modern portal for your Plex community — the friendly Organizr replacement.</h3>

  <p>
    🇫🇷 <a href="#français">Français</a> &nbsp;·&nbsp; 🇬🇧 <a href="#english">English</a>
  </p>
</div>

---

# Français

<a id="français"></a>

<p align="right"><a href="#english">🇬🇧 Read this in English</a></p>

## Pourquoi Portarr

Si vous faites tourner Plex pour votre famille ou vos amis, vous êtes probablement déjà passé par [Organizr](https://organizr.app) pour leur donner une seule page d'accueil plutôt que cinq favoris différents. Portarr, c'est ce que cette page peut devenir quand elle est pensée spécifiquement pour une communauté Plex plutôt que d'être un dashboard générique : elle connaît votre bibliothèque, vos demandes et vos utilisateurs — parce qu'elle parle directement à Plex, Sonarr, Radarr, Overseerr et Tautulli, pas à travers des iframes.

Concrètement, ça donne :

- **Une vraie connexion Plex**, pas un mot de passe de portail partagé — chaque utilisateur se connecte avec son propre compte Plex, et l'accès suit exactement ce que votre serveur partage réellement.
- **Un contenu qui s'adapte à qui regarde** — historique de visionnage personnel, stats personnelles, uniquement ses propres demandes en attente.
- **Pas d'iframes à dompter** — pas de galère avec X-Frame-Options, pas de CSS qui se bat entre cinq thèmes différents. Une interface cohérente, rendue côté serveur, rapide.
- **Un admin qui n'a pas besoin de toucher au serveur** pour poster une annonce, envoyer un mail groupé, ou voir qui utilise vraiment le portail.

Ce n'est pas une suite de gestion média complète — pour ça, gardez les interfaces natives des \*arr. Portarr, c'est la page que voient vos utilisateurs.

## Captures d'écran

### Dashboard

Les derniers ajouts (films et séries) dans un carrousel de posters animé — chaque carte renvoie vers la fiche du média sur Plex Web — et ce qui est en cours de lecture sur le serveur.

<img src="docs/screenshots/dashboard-hero.png" alt="En-tête du dashboard et lecture en cours" width="800">
<img src="docs/screenshots/recently-added.png" alt="Carrousels des derniers ajouts" width="800">

Un calendrier des sorties à venir, alimenté par Sonarr/Radarr :

<img src="docs/screenshots/calendar.png" alt="Calendrier des sorties" width="800">

Les statistiques globales issues de Tautulli, et les demandes Overseerr en attente propres à chaque utilisateur :

<img src="docs/screenshots/stats.png" alt="Statistiques" width="800">
<br>
<img src="docs/screenshots/requests.png" alt="Demandes en attente" width="800">

### Recherche globale

Recherchez dans votre bibliothèque Plex depuis n'importe où dans l'app ; les résultats renvoient vers Plex Web.

<img src="docs/screenshots/search.png" alt="Recherche globale" width="800">

### Explorateur de fichiers *(optionnel)*

Navigation en lecture seule dans un dossier monté, avec téléchargement via URL signée (reprise de téléchargement supportée). N'apparaît que si `FILES_ROOT_PATH` est configuré.

<img src="docs/screenshots/files.png" alt="Explorateur de fichiers" width="800">

### Panneau d'administration

Gérez les membres, les mailings, le stockage et les annonces du dashboard sans redéploiement.

<img src="docs/screenshots/admin.png" alt="Accueil administration" width="800">

Une vue des membres croisée avec l'activité Plex/Tautulli et le statut d'abonnement à la newsletter :

<img src="docs/screenshots/members.png" alt="Administration des membres" width="800">

Des modèles de mail réutilisables, un historique d'envoi, et la newsletter automatisée, au même endroit :

<img src="docs/screenshots/mailings.png" alt="Administration des mailings" width="800">

*(Toutes les captures ci-dessus proviennent d'une instance réelle en production, avec noms d'utilisateurs et emails remplacés par des valeurs génériques.)*

## Fonctionnalités

- **Connexion Plex SSO** — flux OAuth PIN, pas de système de comptes séparé. L'accès est réservé aux comptes que votre serveur Plex partage réellement.
- **Dashboard** — carrousel des derniers ajouts, calendrier des sorties, lecture en cours, demandes en attente, stats Tautulli globales et personnelles, historique de visionnage perso, widget stockage optionnel.
- **Recherche globale** — recherche dans votre bibliothèque Plex, liens directs vers Plex Web.
- **Explorateur de fichiers** *(optionnel)* — navigation en lecture seule dans un dossier, téléchargements signés et reprenables ; sert les fichiers directement ou redirige vers un service proxy séparé.
- **Annonces** — une bannière gérée par l'admin sur le dashboard, sans redéploiement.
- **Mailing** — diffusion vers vos utilisateurs (par groupe d'activité ou sélection manuelle), modèles Markdown réutilisables, envoi de test obligatoire avant tout envoi de masse.
- **Newsletter** — récap automatique des nouveautés, opt-in/opt-out par utilisateur, archive web publique, déclenchement cron ou manuel.
- **Notifications de disponibilité** — email automatique quand une demande Overseerr approuvée devient disponible.
- **Panneau d'administration** — annonces, modèles de mail + historique, vue des membres, synchronisation Plex manuelle, usage du stockage.

## Stack technique

Next.js 14 (App Router, TypeScript) · SQLite (`better-sqlite3`) · Docker

## Prérequis

- Un serveur Plex Media Server, avec un token API pour un compte pouvant voir votre bibliothèque et vos utilisateurs partagés.
- Des instances Sonarr et Radarr (pour le calendrier des sorties).
- Tautulli (pour la lecture en cours et les stats).
- Overseerr (pour le suivi des demandes).
- Un compte SMTP (pour le mailing/newsletter/notifications).
- Node.js 20+ (pour le dev local) ou Docker (pour le déploiement).

## Configuration

Copiez `.env.example` vers `.env.local` (dev) ou `.env` (Docker) et remplissez-le. Chaque variable marquée **obligatoire** doit être définie, sinon l'app refuse de démarrer avec une erreur claire listant exactement ce qui manque ; tout ce qui est marqué **optionnel** peut rester non défini et l'app fonctionne quand même — la fonctionnalité correspondante n'apparaît simplement pas.

| Variable | Obligatoire | Débloque |
|---|---|---|
| `DATABASE_PATH` | ✅ | Emplacement du fichier SQLite |
| `SESSION_SECRET` | ✅ | Signature du cookie de session (32+ caractères aléatoires) |
| `PLEX_URL`, `PLEX_SERVER_TOKEN`, `PLEX_SERVER_NAME`, `PLEX_CLIENT_IDENTIFIER` | ✅ | Accès API Plex + connexion |
| `TAUTULLI_URL`, `TAUTULLI_API_KEY` | ✅ | Lecture en cours, statistiques |
| `SONARR_URL`, `SONARR_API_KEY` | ✅ | Calendrier des sorties (séries) |
| `RADARR_URL`, `RADARR_API_KEY` | ✅ | Calendrier des sorties (films) |
| `OVERSEERR_URL`, `OVERSEERR_API_KEY` | ✅ | Demandes en attente, notifications de disponibilité |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME` | ✅ | Mailing, newsletter, notifications de disponibilité |
| `NEWSLETTER_CRON_SECRET` | ✅ | Authentification des endpoints cron newsletter/notifications |
| `PUBLIC_BASE_URL` | ✅ | Liens absolus dans les emails sortants |
| `SHORTCUT_<NOM>_URL` / `SHORTCUT_<NOM>_ICON_URL` (×6 : `PLEX`, `OVERSEERR`, `TAUTULLI`, `WIZARR`, `POSTERR`, `PLEX_REWIND`) | optionnel | Un raccourci dans la sidebar, un par paire définie. Les deux variables doivent être définies pour afficher une icône ; un raccourci avec seulement `_URL` s'affiche en lien texte seul. Totalement absent = ce raccourci n'apparaît pas. |
| `FILES_ROOT_PATH` | optionnel | La page `/files`, le lien sidebar "Fichiers", et la route de téléchargement |
| `FS_TIMEOUT_MS` | optionnel | Timeout (ms) pour les appels filesystem sur le montage — défaut `5000` |
| `DOWNLOAD_SIGNING_SECRET` | optionnel | Requis seulement avec `DOWNLOAD_PROXY_URL` — signe les URLs de redirection |
| `DOWNLOAD_PROXY_URL` | optionnel | Redirige les téléchargements vers un proxy séparé au lieu de les streamer via cette app — voir [Proxy de téléchargement](#proxy-de-téléchargement-optionnel) |
| `STORAGE_VOLUMES` | optionnel | Tableau JSON (`[{"name":"...","path":"..."}]`) des volumes montés à afficher en barres d'usage sur `/admin` |
| `KUMA_URL`, `KUMA_API_KEY` | optionnel | Un badge de statut "tout est en ligne" / "N services en panne" sur le dashboard, alimenté par [Uptime Kuma](https://github.com/louislam/uptime-kuma) |

Référence complète avec commentaires : [`.env.example`](.env.example).

## Lancer en local

```bash
cp .env.example .env.local   # remplissez avec de vraies valeurs
npm install
npm run dev
```

## Tests & build

```bash
npm test         # vitest run
npm run typecheck  # tsc --noEmit
npm run build     # next build — attrape des classes de bugs que vitest/tsc ratent (route handlers, frontières Server/Client Component)
```

## Déploiement (Docker)

Une image pré-construite est publiée sur GHCR à chaque release :

```bash
docker run -d \
  --name portarr \
  --env-file .env \
  -e HOSTNAME=0.0.0.0 \
  -v $(pwd)/data:/app/data \
  -p 3000:3000 \
  ghcr.io/titi69lpb/portarr:latest
```

Ou construisez l'image vous-même depuis les sources :

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

`HOSTNAME=0.0.0.0` est obligatoire — sans ça, le serveur Next.js standalone bind sur l'IP interne du conteneur et casse ses propres self-fetches internes vers ses routes API (utilisées par certaines routes).

Placez un reverse proxy (Traefik, Caddy, nginx...) devant pour le TLS ; l'app elle-même ne parle qu'en HTTP simple sur le port 3000.

### Monter un dossier pour l'explorateur de fichiers (optionnel)

Si vous définissez `FILES_ROOT_PATH`, montez le dossier correspondant en lecture seule dans le conteneur à ce même chemin, ex :

```bash
-v /chemin/sur/l-hote:/mnt/shared-storage:ro
```

### Proxy de téléchargement (optionnel)

Par défaut, quand `FILES_ROOT_PATH` est défini et `DOWNLOAD_PROXY_URL` ne l'est pas, l'app sert les téléchargements elle-même (avec support HTTP Range pour la reprise). Si votre déploiement place l'app derrière un chemin réseau lent ou tunnelé vers le stockage, vous pouvez faire tourner [portarr-dl-proxy](https://github.com/titi69lpb/portarr-dl-proxy) sur une machine ayant un accès direct au stockage et pointer `DOWNLOAD_PROXY_URL` vers lui — l'app signe alors une URL de courte durée (HMAC-SHA256, `DOWNLOAD_SIGNING_SECRET` partagé entre les deux services) et redirige plutôt que de streamer le fichier elle-même.

### Tâches cron (optionnel)

Newsletter (ajustez la fréquence selon vos besoins) :

```cron
0 14 * * 5 curl -s -X POST -H "x-newsletter-secret: $NEWSLETTER_CRON_SECRET" https://votre-domaine.example.com/api/admin/newsletter/send
```

Notifications de disponibilité (vérifie les demandes Overseerr approuvées mais pas encore disponibles) :

```cron
*/15 * * * * curl -s -X POST -H "x-cron-secret: $NEWSLETTER_CRON_SECRET" https://votre-domaine.example.com/api/cron/request-availability
```

Les deux réutilisent `NEWSLETTER_CRON_SECRET` plutôt que d'avoir besoin d'un secret dédié.

## Licence

MIT — voir [LICENSE](LICENSE).

---

# English

<a id="english"></a>

<p align="right"><a href="#français">🇫🇷 Lire en français</a></p>

## Why Portarr

If you're running Plex for family or friends, you've probably reached for [Organizr](https://organizr.app) to give them one nice landing page instead of five bookmarks. Portarr is what that page can look like when it's built specifically for a Plex community instead of being a generic dashboard: it knows about your library, your requests, and your users — because it talks to Plex, Sonarr, Radarr, Overseerr and Tautulli directly, not through iframes.

What that gets you, concretely:

- **Real Plex login**, not a shared portal password — every user signs in with their own Plex account, and access follows whoever your server actually shares with.
- **Content that reacts to who's looking** — personal watch history, personal stats, only your own pending requests.
- **No iframes to fight with** — no X-Frame-Options headaches, no CSS fighting five different apps' themes. One consistent UI, server-rendered, fast.
- **An admin who doesn't need to touch the server** to post an announcement, send a broadcast email, or check who's actually using the thing.

It's not trying to be a full media-management suite — for that, keep using \*arr's own UIs. Portarr is the page your users see.

## Screenshots

### Dashboard

Recently-added movies and shows in an animated poster carousel — each card links straight to its Plex Web detail page — plus what's currently playing on the server.

<img src="docs/screenshots/dashboard-hero.png" alt="Dashboard header and Now Playing" width="800">
<br>
<img src="docs/screenshots/recently-added.png" alt="Recently added carousels" width="800">



<img src="docs/screenshots/calendar.png" alt="Coming Soon calendar" width="800">

Server-wide stats from Tautulli, and each user's own pending Overseerr requests:

<img src="docs/screenshots/stats.png" alt="Box Office stats" width="800">
<img src="docs/screenshots/requests.png" alt="Pending requests" width="800">
An upcoming-releases calendar sourced from Sonarr/Radarr:
### Global search

Search your Plex library from anywhere in the app; results link into Plex Web.

<img src="docs/screenshots/search.png" alt="Global search" width="800">

### File browser *(optional)*

Read-only browsing of a mounted directory, with signed-URL downloads (Range/resume supported). Only appears when `FILES_ROOT_PATH` is configured.

<img src="docs/screenshots/files.png" alt="File browser" width="800">

### Admin panel

Manage members, mailings, storage, and dashboard announcements without a redeploy.

<img src="docs/screenshots/admin.png" alt="Admin hub" width="800">

A members view cross-referenced with Plex/Tautulli activity and newsletter opt-in status:

<img src="docs/screenshots/members.png" alt="Members admin" width="800">

Reusable mail templates, a send history, and the automated newsletter, all in one place:

<img src="docs/screenshots/mailings.png" alt="Mailings admin" width="800">

*(All screenshots above are from a real running instance, with usernames and emails replaced by placeholders.)*

## Features

- **Plex SSO login** — OAuth PIN flow, no separate account system. Access is restricted to accounts your Plex server actually shares with.
- **Dashboard** — recently-added carousel, release calendar, now-playing, pending requests, server-wide and personal Tautulli stats, personal watch history, optional storage widget.
- **Global search** — searches your Plex library, links straight into Plex Web.
- **File browser** *(optional)* — read-only directory browsing with signed, resumable downloads; serves files directly or redirects to a separate proxy service.
- **Announcements** — an admin-managed banner on the dashboard, no redeploy needed.
- **Mailing** — broadcast to your user base (by activity group or hand-picked), reusable Markdown templates, a required test-send before any mass send.
- **Newsletter** — automated "what's new" recap, opt-in/opt-out per user, a public web archive, cron-triggered or manual.
- **Availability notifications** — emails a user automatically when their approved Overseerr request becomes available.
- **Admin panel** — announcements, mail templates + history, members view, manual Plex sync, storage usage.

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

A pre-built image is published to GHCR on every release:

```bash
docker run -d \
  --name portarr \
  --env-file .env \
  -e HOSTNAME=0.0.0.0 \
  -v $(pwd)/data:/app/data \
  -p 3000:3000 \
  ghcr.io/titi69lpb/portarr:latest
```

Or build it yourself from source:

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

By default, when `FILES_ROOT_PATH` is set and `DOWNLOAD_PROXY_URL` is not, the app serves file downloads itself (with HTTP Range support for resumable downloads). If your deployment puts the app behind a slow or tunneled network path to the storage mount, you can run [portarr-dl-proxy](https://github.com/titi69lpb/portarr-dl-proxy) on a machine with direct access to the storage and point `DOWNLOAD_PROXY_URL` at it — the app then signs a short-lived URL (HMAC-SHA256, `DOWNLOAD_SIGNING_SECRET` shared between both services) and redirects there instead of streaming the file itself.

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
