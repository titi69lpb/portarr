# Jellyfin activity (Jellyfin support, sub-project 3a) — design spec

**Date:** 2026-09-22
**Status:** Design approved by user in chat, awaiting written-spec review.
**Scope:** Portarr only (public repo). Sub-project 3a of the Jellyfin support work. Builds on sub-projects 1 and 2 (already merged into `main`, v1.5.0): the `MediaServer` interface, provider-aware identity, and the Jellyfin adapter (login, library, posters).

## Problem

Now-playing, personal stats, personal watch history and the "Box Office" global stats widget are all sourced from Tautulli and matched to the logged-in user **by email** (`src/lib/tautulli.ts`, `src/lib/activity.ts`). A Jellyfin member has no reliable email of their own (sub-project 2 fills it best-effort from Seerr), so this path does not work for Jellyfin members at all today: their dashboard shows empty activity sections, and the admin members list shows no "last activity" for them.

## Decisions (agreed with the user)

- **Two ways to get Jellyfin activity, with different feature levels, both selected explicitly:**
  - **Jellystat** (`JELLYFIN_ACTIVITY_SOURCE=jellystat`): full parity with Plex/Tautulli — now-playing, personal stats, paginated personal history, and the Box Office widget (most-watched/popular movies and shows, most active libraries and users). Verified in this session against a real Jellystat 1.1.12 instance.
  - **Native** (`JELLYFIN_ACTIVITY_SOURCE=native`, the default once Jellyfin is configured): now-playing only, via Jellyfin's own `/Sessions`. Stats, history and Box Office are empty/hidden for Jellyfin members in this mode — this repo's Jellyfin install has no Playback Reporting plugin, so that path cannot be made to work reliably without asking every self-hoster to install and configure a plugin Portarr does not control.
  - A self-hoster who wants full parity picks Jellystat.
- **Identity**: every activity lookup now takes the whole member (`provider`, `id`, `email`) instead of a bare id. Tautulli keeps matching by email internally (unchanged behavior); Jellystat and the native source match by the Jellyfin user id directly — no lookup needed, and no dependency on Seerr's email guess.
- **No change when Jellyfin is not configured**: with only Plex + Tautulli active, every response shape and every French string stays byte-identical to today.
- **Out of scope** (sub-project 3b): making Tautulli optional, Jellyfin-only installs. Also out of scope: the newsletter subject and any other place still tied to `config.plex.serverName` specifically (a separate, pre-existing gap, unrelated to activity).

## Verified facts (Jellystat 1.1.12, read-only, 2026-09-22)

The user provided a Jellystat API key for this session (never printed to logs, never committed).

- **Auth**: header `x-api-token: <key>` on every call (Jellystat also supports a JWT from its own login, not used here). Keys are managed at `GET/POST/DELETE /api/keys`, stored as a JSON array on Jellystat's own `app_config` row — unrelated to Jellyfin's or Portarr's own keys.
- **Now-playing**: `GET /proxy/getSessions` live-proxies to Jellyfin's `/Sessions` (not Jellystat's own DB), so it has the same freshness as calling Jellyfin directly. Returns `[]` when nobody is watching (confirmed).
- **Per-member last activity** (for the admin list): `GET /stats/getAllUserActivity` returns one row per user with `UserId` (the Jellyfin user id, 32 hex — the same id Portarr already uses for `MediaMember.userId`), `UserName`, `LastActivityDate` (ISO), `TotalPlays`, `TotalWatchTime`.
- **Personal history**: `POST /api/getUserHistory?size=&page=&sort=ActivityDateInserted&desc=true` with body `{ userid }` returns `{ current_page, pages, size, results: [...] }`. Each result carries `NowPlayingItemName`, `SeriesName` (null for a movie), `SeasonId`, `EpisodeId`, `EpisodeNumber`, `SeasonNumber`, `FullName` (pre-built "Series : S2E7 - Title" display string), `ActivityDateInserted` (ISO), `PlaybackDuration` (seconds), `NowPlayingItemId`. Poster: the same `jellyfinPosterRef(id)` scheme from sub-project 2 applies, using the season id for an episode (matching the existing Plex-side convention of showing the season poster, not the episode still).
- **Box Office equivalents**, all `POST` with `{ days, type? }` (days=365 to match Tautulli's `time_range=365`):
  - `getMostViewedByType` (`type: 'Movie' | 'Series'`) → `{ Name, Plays, Id }` — maps to `topMovies` / `topTv`.
  - `getMostPopularByType` (same `type`) → `{ Name, unique_viewers, Id }` — maps to `popularMovies` / `popularTv`.
  - `getMostViewedLibraries` → `{ Name, Plays }` — maps to `topLibraries`.
  - `getMostActiveUsers` → `{ Name, Plays, UserId }` — maps to `topUsers`.
  - (`topPlatforms` / `mostConcurrent` have no Jellystat equivalent checked — `StatsGlobal.tsx` already never renders them, so this is moot.)
- **Native `/Sessions`**: reachable today with the existing Jellyfin admin key from sub-project 2, no extra config. **Not exercised against a real playing session** (nothing was playing during verification) — the mapping from Jellyfin's `SessionInfo`/`NowPlayingItem`/`PlayState` shape to Portarr's `ActiveSession` is built from the API's documented fields, not confirmed against live data. Flag this the same way sub-project 2 flagged the untested successful Jellyfin login: real-world verification happens at first use, and the plan must not treat this mapping as load-bearing-safe.

## Structure

New `src/lib/activity/`, parallel to `src/lib/media/`:

- `types.ts`: the current activity types moved here unchanged (`ActiveSession`, `PersonalStats`, `PersonalStatsByType`, `RecentHistoryItem`, `WatchHistoryPage`, `GlobalStat`, `StatCategory`), plus the `ActivitySource` interface. Every per-member method takes the member's `MediaMember` (provider + id + email + username, already defined in `media/types.ts`) rather than a bare string, so Tautulli can use the email and Jellystat can use the id without either being bent to fit the other.
- `tautulli-source.ts`: `src/lib/tautulli.ts` moved here unchanged (same queries, same caching, same edge-case comments), plus `src/lib/activity.ts`'s `getActiveSessions`, exposed through `ActivitySource`. This is always the Plex activity source; Tautulli has no Jellyfin awareness.
- `jellystat.ts`: low-level Jellystat API client (injected `fetchFn`, same shape as `media/jellyfin.ts`) for every endpoint verified above.
- `jellystat-source.ts`: adapter implementing `ActivitySource` via `jellystat.ts`, matching members by Jellyfin user id.
- `jellyfin-native-source.ts`: `nowPlaying()` only, via one new low-level function in `media/jellyfin.ts` (`GET /Sessions`, already Edge-safe there). Every other method returns empty/null — a documented, deliberate degradation, not a bug.
- `registry.ts`: `getActivitySources(config): ActivitySource[]` — the Tautulli source when Plex + Tautulli are configured (unchanged condition from today); for Jellyfin, the Jellystat source when Jellystat is configured **and** `JELLYFIN_ACTIVITY_SOURCE=jellystat`, otherwise the native source when Jellyfin is configured.
- `aggregate.ts`: `nowPlayingAll`, `recentHistoryAll`, `globalStatsAll` (merges Box Office categories across active sources; with only Tautulli active — every install without Jellyfin, and every Jellyfin install in native mode — output is byte-identical to today's single-source result). Personal-stats and history-page calls go straight to the one source matching the member's own provider — there is never more than one activity source per member.

### Edge runtime

None of this is reachable from `src/middleware.ts` (dashboard/stats/history are ordinary Node routes). No constraint here, unlike sub-projects 1 and 2.

## Config

- New service `jellystat` in `settings-schema.ts`: `JELLYSTAT_URL` (text), `JELLYSTAT_API_KEY` (password). Connection test: an authenticated `GET /api/keys` with the submitted key (verified in this session to return 200 for a valid key).
- New setting `JELLYFIN_ACTIVITY_SOURCE` (`jellystat` | `native`, default `native`), same env > DB > default precedence as every other setting. Not a URL/key pair, so it is a simple choice control (radio/select) rather than a `ServiceKey` form field — exact UI placement (wizard step vs. settings page) decided in the plan.
- Both are meaningful only when Jellyfin itself is configured; neither blocks or is blocked by the (already optional) Jellyfin wizard step.
- `isSetupComplete` is unchanged: Plex, Tautulli, Sonarr, Radarr, Overseerr, SMTP and the public URL stay the only required services.

## Identity and degradation

- Every `ActivitySource` method takes a `MediaMember`. `members.ts`'s `getMemberOverview` calls the activity source matching each member's own provider; a member whose provider has no active source (Jellyfin in native mode, or Jellystat down) gets `lastSeen: null`, same as today's "never logged in" state — no new column, no new null-handling burden on the UI.
- The admin members list column "Dernière activité Plex" is renamed to "Dernière activité" (generic) and shows `—` for a member with no data, exactly like it already does for a Plex member Tautulli has never seen.
- Every activity fetch stays wrapped in the existing `safe()` fallback pattern already used throughout `app/page.tsx` (empty result, never a 500) — a Jellystat outage degrades a Jellyfin member's dashboard sections to empty, it never breaks the page.

## Testing and verification

- `jellystat.ts` unit tests use fixtures shaped from the verified real responses above, with the real user id, username and Jellystat host anonymized (same rule as sub-project 2, since this is a public repo).
- `ActivitySource` conformance is tested through fake sources (mirroring `tests/lib/media/fake-provider.ts`) for `registry.ts`, `aggregate.ts` and `members.ts`, so nothing but `jellystat.ts` and `tautulli-source.ts` (moved, already covered by existing tests) needs a live server.
- A Plex + Tautulli install's dashboard, stats, history and admin-list responses must stay byte-identical to the pre-change output — regression tests reuse the existing Tautulli test fixtures unchanged.
- Final gate: `next build`, `tsc --noEmit`, the whole suite (one known pre-existing failure in `tests/api/dashboard-stats.test.ts`, from before this branch).

## Delivery

Branch `feat/jellyfin-activity`, directly on `main` (sub-projects 1 and 2 are merged, no more stacking needed). PR on `titi69lpb/portarr`, executed with subagent-driven development. Tag and GitHub Release only after explicit user approval, as with the v1.5.0 release.

## Out of scope

Sub-project 3b (Tautulli optional, Jellyfin-only installs); the newsletter subject still reading `config.plex.serverName`; a real Playback Reporting-backed native history/stats path; verifying the native now-playing mapping against an actual live Jellyfin session (flagged above as unverified, to be confirmed at first real use).
