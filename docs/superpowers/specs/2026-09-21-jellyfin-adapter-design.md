# Jellyfin adapter (Jellyfin support, sub-project 2) — design spec

**Date:** 2026-09-21
**Status:** Design approved by user in chat, awaiting written-spec review.
**Scope:** Portarr only (public repo). Sub-project 2 of 3 for Jellyfin support. Builds on sub-project 1 (`docs/superpowers/specs/2026-09-21-media-server-abstraction-design.md`, PR #3).

## Problem

Sub-project 1 put Plex behind a `MediaServer` interface and made identity `(provider, id)`. Nothing implements a second provider yet. This sub-project adds Jellyfin as a **second** media server that runs alongside the existing Plex + Tautulli setup: configuration, login, membership, library (search, recently added), posters and member emails.

## Decisions (agreed with the user)

- **Jellyfin runs alongside Plex + Tautulli in this sub-project.** Plex and Tautulli stay required. A Jellyfin-only install (Tautulli optional) is sub-project 3.
- **Jellyfin login:** username + password, checked server-side with `POST /Users/AuthenticateByName`. The password is never stored or logged.
- **Identity:** two accounts on two providers are two distinct members (decision from sub-project 1). A member badge shows the provider in the admin list.
- **Member emails:** Jellyfin users have no email. They are filled from Seerr/Overseerr users, matched by Jellyfin user id first, then by username. No match means an empty email, and the member is excluded from mailings (the existing sync already skips members without an email).
- **Activity is out of scope** (now-playing, stats, history). Sub-project 3 builds an `ActivitySource` interface with three implementations and makes Tautulli optional. The user added on 2026-09-21 that **Jellystat must be supported as a choice instead of Tautulli when the server is Jellyfin** (the alternative being the native Jellyfin API with the Playback Reporting plugin). That lands in sub-project 3.

## Structure

New files under `src/lib/media/`, same split as Plex:

- `jellyfin.ts`: low-level Jellyfin API functions taking an injected `fetchFn`.
- `jellyfin-provider.ts`: `createJellyfinProvider(cfg, fetchFn)` returning a `MediaServer`. Structural config type (`JellyfinProviderConfig = { url, apiKey }`), no import of `config.ts` (Edge constraint).
- `seerr-emails.ts`: fetch Seerr/Overseerr users and `enrichMembersWithEmail(members, seerrUsers)`.

Interface changes in `types.ts`:

- `ProviderAuth = PinAuth | PasswordAuth`, where `PasswordAuth = { kind: 'password'; authenticate(username, password): Promise<PasswordResult> }` and `PasswordResult = { status: 'denied' } | { status: 'ok'; user: MediaMember; isOwner: boolean }`.
- `MediaServer` gains `handlesPoster(ref: string): boolean` and `poster(ref: string): Promise<{ bytes: ArrayBuffer; contentType: string } | null>`. The Plex adapter implements both (behavior of the current poster route, unchanged).

### Edge runtime constraint

Everything reachable from `src/middleware.ts` (now including `jellyfin-provider.ts` through `membership.ts`) must not import `config.ts`, `db.ts`, `better-sqlite3`, `fs`, `path` or any `node:` module. The existing `tests/middleware-edge-imports.test.ts` keeps guarding this.

## Configuration

- New service key `jellyfin` in `settings-schema.ts` with fields `JELLYFIN_URL` and `JELLYFIN_API_KEY` (an admin API key from the Jellyfin dashboard). Added to `CONFIGURABLE_KEYS`, `AppConfig.jellyfin: JellyfinConfig | null`, the settings page and the wizard.
- A real connection test (`GET /System/Info` with the API key) is mandatory before saving, like every other service.
- The wizard step is **optional**: a "Passer" button advances without writing anything. `isSetupComplete` is unchanged (Plex, Tautulli, Sonarr, Radarr, Overseerr, SMTP, public URL).
- `getActiveProviders` activates Jellyfin as soon as `config.jellyfin` is set, independently of Tautulli.
- `ConfiguredAppConfig.plex` / `tautulli` stay non-null in this sub-project (comment already in place from sub-project 1).

## Login, identity and sessions

- `/login` becomes a server component reading the active providers and rendering a client form: the existing Plex button (PIN popup, unchanged) when Plex is active, an identifier + password form when Jellyfin is active, both when both are. The "denied" message is generic per provider.
- New route `POST /api/auth/password` with `{ provider: 'jellyfin', username, password }`. It calls `getProvider(config, 'jellyfin').auth.authenticate(...)`. On success it upserts `users` and sets the session cookie through a helper extracted from the Plex poll route (`finishLogin`), so both providers share one code path.
- `authenticate` calls `POST /Users/AuthenticateByName`, keeps `User.Id`, `User.Name` and `Policy.IsAdministrator`, and denies when `Policy.IsDisabled`. The Jellyfin access token in the response is discarded immediately (best-effort logout through the API, to confirm in the spike).
- **Brute-force protection:** Portarr must not become a password-guessing relay. A per-IP limit (as for Plex login) **plus** a per-username limit, and the same response for "wrong password" and "unknown account".
- **Session:** `{ provider: 'jellyfin', userId: User.Id, email, username, isOwner }`, with `isOwner` = Jellyfin administrator at login time (never revalidated, like the Plex owner).
- **Membership:** every non-disabled Jellyfin user is a member. `isMember(userId)` reads `GET /Users` (cached 5 minutes, fails open on error, like Plex). `listMembers()` maps users to `MediaMember`.
- **Middleware:** `isStillMember` gains the `jellyfin` case, reading `JELLYFIN_URL` / `JELLYFIN_API_KEY` from `process.env` only. An install configured only through the DB skips revalidation (same accepted degradation as Plex).

## Library and posters

- **Recently added:** `GET /Items` with `includeItemTypes=Movie,Episode`, `sortBy=DateCreated`, `sortOrder=Descending`, `recursive=true`, `fields=DateCreated`, authenticated with the API key. Episodes are collapsed to one entry per series (the most recent), mirroring Plex's grouping. `addedAt` comes from `DateCreated`; `webUrl` is the deep link into the Jellyfin web UI.
- **Search:** `GET /Items?searchTerm=...` limited to `Movie,Series`, 10 results, same `SearchResultItem` shape as Plex.
- **Posters:** `thumbPath` stays an opaque string that every component already passes to `/api/newsletter/poster`. Jellyfin refs are `jellyfin:<itemId>`. The route asks each active provider whether it `handlesPoster(ref)`; Plex keeps its current path regex, Jellyfin validates `^jellyfin:[0-9a-f-]{32,36}$` then fetches `/Items/{id}/Images/Primary` resized to 300x450. The API key never leaves the server. The route keeps its always-successful placeholder contract. Rejected alternative: adding `provider` + `itemId` to every item, which would touch every poster consumer for no gain.
- **Newsletter:** `getNewsletterItems` already aggregates active providers, so Jellyfin additions flow in. The subject keeps `config.plex.serverName` (one server name per install; out of scope).

## Member emails from Seerr/Overseerr

- `fetchSeerrUsers(url, apiKey)` reads the Seerr/Overseerr user list (paginated) with `X-Api-Key`. `enrichMembersWithEmail` fills the email of Jellyfin members whose email is empty, matching by Jellyfin user id (dashes normalized), then by case-insensitive username. It is applied in the admin member sync and at Jellyfin login.
- A Seerr failure is logged and leaves emails empty; it never blocks a login or a sync.
- The exact Seerr user fields and their names are **unverified until the spike** (the published spec lacks a `GET /user` definition and Jellyfin fields).

## Admin UI

- The members list shows a "Plex" / "Jellyfin" badge next to each member.

## Spike (first task of the plan) — verify against the live servers

Read-only calls against the local `jellyfin` and `seerr` containers (the user authorized reading their API keys for this; keys are used for `GET` calls and never printed). Confirm and record, with sanitized fixtures for the tests:

1. The `Authorization` header format Jellyfin expects for API-key calls and for `AuthenticateByName` (the OpenAPI only says "API key header").
2. `GET /System/Info` response and required permission.
3. `GET /Users`: id format (with or without dashes), `Policy.IsAdministrator`, `Policy.IsDisabled`, absence of email.
4. `AuthenticateByName` success and failure responses (status codes, disabled account behavior) and the logout endpoint for discarding the token.
5. `GET /Items` with `fields=DateCreated`, `SeriesId`, `SeriesName`, `ServerId`, `ImageTags`, `ProductionYear`; behavior with an API key and no `userId`.
6. `GET /Items/{id}/Images/Primary` with `maxWidth`, `maxHeight`, `quality`, and which item id carries the poster for an episode (series or season).
7. The web deep-link URL format into the Jellyfin UI.
8. Seerr `GET /api/v1/user`: pagination parameters, email field, and how a Jellyfin account is linked (id and/or username field names).

If the spike contradicts an assumption in this spec, the plan's later tasks are adjusted before implementation and the difference is recorded in the spec.

## Testing and verification

- Unit tests with fixtures from the spike for every Jellyfin and Seerr call, through the injected `fetchFn`.
- Login: success, wrong password, disabled account, both rate limits, password never present in logs or responses.
- Email enrichment: match by id, by username, no match, Seerr failure.
- Poster: routed to the right provider, placeholder on failure, invalid ref rejected.
- Edge guard test unchanged and passing; `isStillMember` jellyfin case covered.
- Final gate: `next build`, `tsc --noEmit`, the whole suite (one known pre-existing failure in `tests/api/dashboard-stats.test.ts`).

## Delivery

Branch `feat/jellyfin-adapter`, stacked on `feat/media-server-abstraction` because PR #3 is not merged yet. Its PR targets that branch and is retargeted to `main` once #3 merges. Executed with subagent-driven development. No tag or GitHub Release until sub-project 3 ships.

## Out of scope

Now-playing, stats, history and the `ActivitySource` interface (sub-project 3, including the Jellystat choice); Tautulli optional / Jellyfin-only installs (sub-project 3); merging one person's Plex and Jellyfin accounts; email entry by users; a per-provider server name in the newsletter subject; Jellyseerr-specific behavior beyond the shared Seerr/Overseerr API.
