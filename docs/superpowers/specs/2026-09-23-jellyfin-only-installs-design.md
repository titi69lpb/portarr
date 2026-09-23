# Jellyfin-only installs (Jellyfin support, sub-project 3b) — design spec

**Date:** 2026-09-23
**Status:** Design approved by user in chat, awaiting written-spec review.
**Scope:** Portarr only (public repo). Sub-project 3b of the Jellyfin support work. Builds on sub-projects 1, 2, and 3a (all merged into `main`, released through v1.6.1): the `MediaServer`/`ActivitySource` abstractions, the Jellyfin adapter, and Jellystat/native activity.

## Problem

Today `isSetupComplete()` (`src/lib/config.ts`) hard-requires `config.plex !== null && config.tautulli !== null` in addition to `getActiveProviders(config).length > 0`. This means an install cannot run with only Jellyfin configured — even though the `MediaServer`/`ActivitySource` abstractions already fully support a Jellyfin-only provider set (`media/registry.ts`'s `getActiveProviders` already returns a Jellyfin-only list correctly when Plex/Tautulli are absent; sub-project 3a's `ActivitySource` registry already handles a Tautulli-less config). The blocker is purely the explicit `config.plex !== null && config.tautulli !== null` clause layered on top, plus a handful of call sites that still assume `config.plex`/`config.tautulli` are non-null once setup is complete.

## Decisions (agreed with the user)

- **Plex and Tautulli become optional as a coupled pair, not independently.** Plex still only activates when Tautulli is also configured (`media/registry.ts`'s existing rule, unchanged — Plex has no native activity source, unlike Jellyfin's native `/Sessions` mode). What changes is that the *pair* is no longer mandatory: an install with only Jellyfin configured (native or Jellystat activity) is now a fully valid, complete setup.
- **New `isSetupComplete` rule**: drop the explicit `config.plex !== null && config.tautulli !== null` clause entirely. The existing `getActiveProviders(config).length > 0` check already encodes the right rule — it only counts Plex when Tautulli is present too, and always counts Jellyfin when configured — so no new logic is needed there, only removal of the now-redundant-and-over-restrictive clause.
- **`ConfiguredAppConfig.plex`/`.tautulli` go back to nullable** (`PlexConfig | null` / `TautulliConfig | null`), same shape as `AppConfig`. Every real compile break this causes gets fixed by hand — compiler-driven migration, same pattern as sub-project 1's Task 12 provider migration. Two real breaks are already identified (see below); there may be others the compiler surfaces during implementation that this spec does not yet know about — the plan should budget for "fix whatever `tsc` flags," not assume the list below is exhaustive.
- **New setting `PUBLIC_COMMUNITY_NAME`** (optional text, precedence: explicit value → `PLEX_SERVER_NAME` if that's set → `"Portarr"`) replaces the two `config.plex.serverName` call sites. Added as a second field on the existing `publicBaseUrl` step/service (not a new step) in both the setup wizard and `/admin/settings` — it's a single generic text field, not a URL+key pair like every other service.
- **Mailing group targeting becomes provider-aware.** `lib/mail-recipients.ts`'s `resolveRecipients`/`selectRecipients` currently take a raw `{ url, apiKey }` Tautulli context and call `getUserActivity` (Tautulli-only, email-keyed) directly for the `activeSince`/`neverActive` group filters. This is replaced with the same provider-aware `lastSeen` lookup `members.ts`'s `getMemberOverview` already uses (`getActivitySources(config)` + per-member `getActivitySourceFor(sources, member.provider).lastSeen(member)`), so a Jellyfin-only or mixed-provider install's members are correctly classified by activity group. `admin/mail/send/route.ts` is updated to pass activity sources instead of a raw Tautulli context.
- **Setup wizard / admin settings**: `onSkip` is added to the Plex and Tautulli steps (today only Jellyfin/Jellystat are skippable). No conditional-skip logic, no reordering — `isSetupComplete` is already the safety net that keeps the app gated on `/setup` if someone skips every provider.
- **Login page**: `src/app/login/page.tsx` already derives its provider buttons from `getActiveProviders(config)` once `isSetupComplete(config)` is true, so a Jellyfin-only install's login page correctly shows only the Jellyfin form once setup is done — verified by reading the current code, no change needed there for the post-setup case. **Known, pre-existing, out-of-scope quirk**: before setup completes (or if `loadConfig` throws), the page falls back to `active = ['plex']` unconditionally — this predates this sub-project (it's how the page already behaved for e.g. a Jellyfin-configured-but-not-yet-`isSetupComplete` install) and does not block a completed Jellyfin-only install from working correctly after setup finishes. Not fixed here.
- **Out of scope**: decoupling Plex from Tautulli internally (Plex-only-no-Tautulli mode) — explicitly declined by the user in favor of the minimal, coupled-pair relaxation. Sonarr/Radarr/Overseerr/SMTP/public URL stay unconditionally required — unrelated to media-provider identity, not touched.

## Structure

No new files. Every change is a targeted edit to already-existing files:

- `src/lib/config.ts`: `isSetupComplete` loses its explicit plex/tautulli clause; `ConfiguredAppConfig.plex`/`.tautulli` become nullable; new `communityName: string` field on `AppConfig` (always resolved, never null — falls back through `PUBLIC_COMMUNITY_NAME` → `PLEX_SERVER_NAME` → `"Portarr"`); `CONFIGURABLE_KEYS` gains `PUBLIC_COMMUNITY_NAME`.
- `src/lib/settings-schema.ts`: `publicBaseUrl`'s `SERVICE_FIELDS` entry gains a second `FieldDef` for `PUBLIC_COMMUNITY_NAME` (type `text`, optional — the settings form's existing "leave blank" semantics already support an optional text field, no new capability needed).
- `src/lib/setup-steps.ts`: no connection test needed for the new field (same as `publicBaseUrl` itself and `jellyfinActivitySource` — `runConnectionTest`'s `case 'publicBaseUrl'` already returns `{ok:true,error:null}` unconditionally and covers the whole step, no per-field test needed since it's not a service).
- `src/app/api/admin/newsletter/send/route.ts`, `src/app/api/cron/request-availability/route.ts`: `config.plex.serverName` → `config.communityName`.
- `src/lib/mail-recipients.ts`: `resolveRecipients`/`selectRecipients` take `ActivitySource[]` (from `getActivitySources`) instead of a raw Tautulli `{url, apiKey}` context; the `activeSince`/`neverActive` filters resolve each member's `lastSeen` via `getActivitySourceFor(sources, member.provider)` instead of calling `getUserActivity` directly. `RecipientDeps`/`defaultRecipientDeps` updated accordingly (or removed if no longer needed as an injection seam — decided during planning based on what the existing tests need).
- `src/app/api/admin/mail/send/route.ts`: passes `getActivitySources(config)` instead of `{url: config.tautulli.url, apiKey: config.tautulli.apiKey}`.
- `src/components/SetupWizard.tsx`, `src/components/AdminSettingsPanel.tsx`: `onSkip` extended to the `plex` and `tautulli` steps (currently only `jellyfin`/`jellystat`).
- Every other file the compiler flags once `ConfiguredAppConfig.plex`/`.tautulli` are loosened — enumerated and fixed during implementation, not assumed exhaustive here.

### Edge runtime

None of the touched files are reachable from `src/middleware.ts` — no Edge constraint applies here, same as sub-project 3a.

## Config

- `PUBLIC_COMMUNITY_NAME` (optional): free text, no format validation, no connection test. Precedence documented above.
- `isSetupComplete` is otherwise unchanged in what it requires: `sonarr`, `radarr`, `overseerr`, `smtp`, `publicBaseUrl` stay mandatory; only the Plex+Tautulli requirement is relaxed, replaced by "at least one active media provider" (which `getActiveProviders(config).length > 0` already expresses).

## Identity and degradation

- A Jellyfin-only install: every Plex-specific UI (login button, admin members' Plex-only affordances, if any) simply doesn't render, following the exact same `getActiveProviders`-driven pattern already used throughout sub-projects 1–3a. No new degradation logic needed beyond what's listed above.
- Mailing group targeting (`activeSince`/`neverActive`) degrades per-member exactly like the admin members list already does: a member whose provider has no active activity source (shouldn't happen post-3a, since every configured provider has at least a native/degraded activity source) is treated as no last-seen data, same as "never active."

## Testing and verification

- `config.test.ts`: new tests for `isSetupComplete` with Jellyfin-only, Plex+Tautulli-only, and neither configured; `communityName` precedence tests (explicit value, `PLEX_SERVER_NAME` fallback, `"Portarr"` default).
- `mail-recipients.test.ts` (existing, if present) or new tests: `resolveRecipients` correctly classifies a Jellyfin-only member into `activeSince`/`neverActive` groups using the activity registry instead of Tautulli directly.
- Every other test file the compiler/test-runner flags once the nullable type change lands gets fixed as part of implementation.
- Final gate: `next build`, `tsc --noEmit`, the whole suite (same one known pre-existing failure in `tests/api/dashboard-stats.test.ts`, unrelated, from before this branch).
- **Live verification** (user-requested, after merge): disable `PLEX_URL`/`PLEX_SERVER_TOKEN`/`PLEX_SERVER_NAME`/`TAUTULLI_URL`/`TAUTULLI_API_KEY` in `portarr-test`'s `.env` on plexcrewv3, redeploy, confirm the whole app runs Jellyfin+Jellystat-only: setup considered complete, login page shows only Jellyfin, dashboard/stats/history work, mailing and newsletter don't crash.

## Delivery

Branch `feat/jellyfin-only-installs`, directly on `main` (sub-projects 1–3a are merged and released through v1.6.1, no more stacking needed). PR on `titi69lpb/portarr`, executed with subagent-driven development. Version bump + tag + GitHub Release only after the user explicitly asks, as with every previous release in this series.

## Out of scope

Decoupling Plex from Tautulli internally (a genuinely Plex-only, no-Tautulli mode) — explicitly declined. The pre-existing `active = ['plex']` fallback in `login/page.tsx` before setup completes — not a regression this sub-project introduces, not fixed here. Any further real-world verification of the native-Jellyfin now-playing mapping against a live session (already flagged as open in sub-project 3a) — unrelated to this sub-project's scope.
