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
- **Member emails:** Jellyfin users have no email. They are filled from Seerr/Overseerr users (matching rules in "Spike results" below). No match means an empty email, and the member is excluded from mailings (the existing sync already skips members without an email).
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
- `authenticate` calls `POST /Users/AuthenticateByName`, keeps `User.Id`, `User.Name` and `Policy.IsAdministrator`, and denies when `Policy.IsDisabled`. The Jellyfin access token in the response is discarded immediately (best-effort `POST /Sessions/Logout`).
- **Brute-force protection:** Portarr must not become a password-guessing relay. A per-IP limit (as for Plex login) **plus** a per-username limit, and the same response for "wrong password" and "unknown account".
- **Session:** `{ provider: 'jellyfin', userId: User.Id, email, username, isOwner }`, with `isOwner` = Jellyfin administrator at login time (never revalidated, like the Plex owner).
- **Membership:** every non-disabled Jellyfin user is a member. `isMember(userId)` reads `GET /Users` (cached 5 minutes, fails open on error, like Plex). `listMembers()` maps users to `MediaMember`.
- **Middleware:** `isStillMember` gains the `jellyfin` case, reading `JELLYFIN_URL` / `JELLYFIN_API_KEY` from `process.env` only. An install configured only through the DB skips revalidation (same accepted degradation as Plex).

## Library and posters

- **Recently added:** `GET /Items` with `includeItemTypes=Movie,Episode`, `sortBy=DateCreated`, `sortOrder=Descending`, `recursive=true`, `fields=DateCreated`, authenticated with the API key. Episodes are collapsed to one entry per series (the most recent), mirroring Plex's grouping. `addedAt` comes from `DateCreated`; `webUrl` is the deep link into the Jellyfin web UI (`<url>/web/index.html#/details?id=<id>&serverId=<ServerId>`).
- **Search:** `GET /Items?searchTerm=...` limited to `Movie,Series`, 10 results, same `SearchResultItem` shape as Plex.
- **Posters:** `thumbPath` stays an opaque string that every component already passes to `/api/newsletter/poster`. Jellyfin refs are `jellyfin:<itemId>`. The route asks each active provider whether it `handlesPoster(ref)`; Plex keeps its current path regex, Jellyfin validates `^jellyfin:[0-9a-f-]{32,36}$` then fetches `/Items/{id}/Images/Primary` resized to 300x450. The API key never leaves the server (Jellyfin also serves images without auth, but the adapter still sends the key). The route keeps its always-successful placeholder contract. Rejected alternative: adding `provider` + `itemId` to every item, which would touch every poster consumer for no gain.
- **Newsletter:** `getNewsletterItems` already aggregates active providers, so Jellyfin additions flow in. The subject keeps `config.plex.serverName` (one server name per install; out of scope).

## Member emails from Seerr/Overseerr

- `fetchSeerrUsers(url, apiKey)` reads the Seerr/Overseerr user list (paginated) with `X-Api-Key`. `enrichMembersWithEmail` fills the email of Jellyfin members whose email is empty, with the matching rules from "Spike results". It is applied in the admin member sync and at Jellyfin login.
- A Seerr failure is logged and leaves emails empty; it never blocks a login or a sync.

## Admin UI

- The members list shows a "Plex" / "Jellyfin" badge next to each member.

## Spike results (done 2026-09-21, read-only, against the local Jellyfin 12.1.0 and Seerr 3.4.1)

The spike was run while writing the plan instead of being a plan task, so every task below uses verified facts. Nothing was written to either server.

1. **Auth header.** On Jellyfin 12.1.0 only `Authorization: MediaBrowser Client="Portarr", Device="Portarr", DeviceId="portarr", Version="1", Token="<apiKey>"` works for API-key calls (the short form `MediaBrowser Token="<apiKey>"` also works). `X-Emby-Token`, `X-MediaBrowser-Token` and `?api_key=` all return 401. Calls without any auth return 401.
2. **`GET /System/Info`** with the key: 200 with `Id`, `ServerName`, `Version`.
3. **`GET /Users`** with the key: 200, an array of users with `Id` (32 hex chars, no dashes), `Name`, `Policy.IsAdministrator`, `Policy.IsDisabled`, `Policy.IsHidden`, and **no email field**. Hidden users are returned (the only user on the test server is a hidden administrator). `?isDisabled=false` works. `GET /Users/{id}` is 200 for a known id and 400 (not 404) for an unknown one.
4. **`POST /Users/AuthenticateByName`** requires the client `Authorization: MediaBrowser Client=..., Device=..., DeviceId=..., Version=...` header (no Token): without it the server answers 400; with it, an unknown user gets 401 with the opaque body "Error processing request." (no way to tell a wrong password from an unknown account). `POST /Sessions/Logout` (204) ends the session of the token in the `Authorization` header. A successful login could not be exercised (no test credentials, and none were guessed).
5. **`GET /Items`** with the API key and no `userId`: 200, `{ Items, StartIndex, TotalRecordCount }`. Items carry `Id`, `Name`, `Type`, `ServerId`, `DateCreated` (ISO with fractional seconds), `ProductionYear`, `SeriesName`, `SeriesId`, `SeasonId`, `ImageTags.Primary`, `SeriesPrimaryImageTag`, `ParentPrimaryImageItemId` (the season id for an episode), `ParentPrimaryImageTag`. An episode can lack `SeriesName` / `SeriesId` / `SeasonId` (unmatched file): the adapter must fall back to the item name and its parent image.
6. **Search** works with `GET /Items?searchTerm=...&includeItemTypes=Movie,Series&recursive=true&limit=10`.
7. **Images.** `GET /Items/{id}/Images/Primary?maxWidth=300&maxHeight=450&quality=90` returns a JPEG for a season, a series and an episode (an episode's own Primary image is a still frame). It also answers 200 **without any auth header**; an unknown item id answers 400.
8. **Web deep link** in the served Jellyfin web client: `#/details?id=<id>` (the older `#!/details` form is absent). The adapter builds `<url>/web/index.html#/details?id=<id>&serverId=<ServerId>`.
9. **Seerr `GET /api/v1/user?take=&skip=`** with `X-Api-Key`: 200, `{ pageInfo: { pages, pageSize, results, page }, results: [...] }`. Each user has `id`, `email`, `username`, `displayName`, `plexUsername`, `plexId`, `jellyfinUsername`, `jellyfinUserId`, `userType`. **On this deployment every Seerr user is a Plex account: `jellyfinUserId` and `jellyfinUsername` are always null.** A Jellyfin member therefore cannot be matched by Jellyfin id here.

### Consequence for email matching (replaces the earlier "id first, then username")

`enrichMembersWithEmail` matches a Jellyfin member with an empty email in this order:

1. Seerr `jellyfinUserId` equals the member's id (dashes and case normalized), exactly one such Seerr user with an email.
2. Otherwise the member's name equals, case-insensitively, one of Seerr `jellyfinUsername`, `username`, `displayName` or `plexUsername`, and **exactly one distinct Seerr user** with an email matches.
3. Any ambiguity (two Seerr users match) or no match leaves the email empty. An existing non-empty email is never overwritten. This cross-identity name match is a deliberate heuristic (Jellyfin accounts are created by the admin, and the email is only used for mailings, never for authentication).

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
