# Media-server abstraction (Jellyfin support, sub-project 1) — design spec

**Date:** 2026-09-21
**Status:** Design approved by user in chat, awaiting written-spec review.
**Scope:** Portarr only (public repo). Sub-project 1 of 3 for Jellyfin support.

## Problem

The user wants Portarr to work with a Jellyfin server instead of Plex, or with both at once on the same instance. Today the Plex coupling has three blocks:

- **Auth and membership**: Plex PIN OAuth, "shared users" as the access list, `plexId` in the session JWT, the `users` and `newsletter_subscriptions` tables and the newsletter tokens (~45 references).
- **Library**: search and recently-added (`src/lib/plex.ts`, 8 importers).
- **Activity**: now-playing, stats and history, all through Tautulli.

## Overall decisions (apply to all 3 sub-projects)

- **Approach A**: a `MediaServer` interface with `plex` and `jellyfin` adapters and a registry of active providers. Search, recently-added and now-playing aggregate over all active providers. Rejected: per-caller `if jellyfin` branches (does not scale to "both"), and a global `MEDIA_SERVER=plex|jellyfin` switch (excludes "both").
- **Identity**: `(provider, id)`. A person with a Plex and a Jellyfin account is two distinct members. No email merging.
- **Jellyfin login** (sub-project 2): username + password, server-side call to `/Users/AuthenticateByName`. The password is never stored.
- **Jellyfin activity** (sub-project 3): native API. `/Sessions` for now-playing, the Playback Reporting plugin for history and stats. If the plugin is absent, those sections degrade cleanly (hidden).
- **Decomposition**, one spec/plan/SDD cycle each:
  1. Foundation (this spec).
  2. Jellyfin adapter: config fields, connection test, wizard step, login, membership, search, recently-added, posters.
  3. Jellyfin activity and merged UI.

## Sub-project 1: scope

Plex moves behind the `MediaServer` interface. There is **no Jellyfin code and no Jellyfin network call** in this sub-project, and no user-visible change. The `provider` dimension is added to session, DB and config so sub-project 2 plugs in without a refactor. Activity (Tautulli) is untouched: `ActivitySource` is sub-project 3.

## Structure

New `src/lib/media/`:

- `types.ts`: `ProviderId = 'plex' | 'jellyfin'`, `MemberRef = { provider, userId }`, the `MediaServer` interface.
- `registry.ts`: returns the active providers for a given config.
- `plex.ts`: current `src/lib/plex.ts` content, moved (low-level Plex API functions, unchanged). `src/lib/plex.ts` is removed.
- `plex-provider.ts`: the adapter exposing the Plex functions through `MediaServer`. Kept separate from `plex.ts` so the low-level functions and the adapter do not import each other.
- `plex-pin.ts`: `resolvePinToSession`, moved out of the `app/api/auth/poll` route folder.
- `aggregate.ts`: fan-out helpers (`searchAll`, `recentlyAddedAll`, `recentlyAddedSplitAll`, `listMembersAll`) that tolerate one failing provider and rethrow only when all fail.
- `membership.ts`: `isStillMember(ref, env)`, the Edge-safe entry point the middleware calls.

`MediaServer` surface:

- `listMembers()`, `isMember(userId)` (fails open on upstream error, as `isStillSharedUser` does today).
- `recentlyAdded(count, type)`, `search(query)`.
- `auth`: discriminated union. Only the `pin` variant (Plex) is defined here; sub-project 2 adds `password`.

The 8 importers of `lib/plex.ts` go through the registry. Search and recently-added aggregate over active providers (one, for now).

### Edge runtime constraint

`middleware.ts` calls `isMember` and runs on the Edge runtime (no `better-sqlite3`, no `fs`; see the 2026-09-18 revision of the admin-wizard spec). Therefore `media/plex.ts` and the registry's `isMember` path must not import `config.ts` or `db.ts`. The middleware keeps reading provider credentials from `process.env` only, with the same accepted degradation (an install configured only via the DB skips revalidation and falls back to the 30-day JWT expiry).

## Identity, session, migration

- `SessionUser` becomes `{ provider, userId, email, username, isOwner }` (replaces `plexId`).
- **Existing sessions stay valid.** `verifySession` still accepts the legacy JWT (`plexId`, no `provider`) and reads it as `{ provider: 'plex', userId: plexId }`. New sessions write the new shape.
- **Existing unsubscribe links stay valid.** `verifyUnsubscribeToken` accepts the legacy `plexId` payload as `plex`. Signing writes `{ provider, userId }`. (Tokens last 90 days and are already in users' mailboxes.)
- **DB.** `users` and `newsletter_subscriptions` change from `plex_id` (PK) to a composite primary key `(provider, external_id)`. SQLite cannot alter a primary key, so migration at startup, in one transaction: create the new table, copy rows with `provider = 'plex'`, drop the old table, rename. Idempotent, guarded by `PRAGMA table_info`. A fresh install creates the new schema directly. `notified_availability` (keyed by `request_id`) is unaffected.
- **Pre-migration backup.** Immediately before the first migration, copy the SQLite file to `<db>.pre-provider-migration` (once). An older image cannot read the new schema; this copy is the documented rollback.

## Config

`isSetupComplete` stops hard-coding "plex AND tautulli" and becomes "at least one active provider" via the registry (Plex active = plex and tautulli configured, since activity is still Tautulli). With Plex only, behavior is identical to v1.4.0. Jellyfin config fields, connection test and wizard step belong to sub-project 2.

## Testing and verification

- New tests: migration of a legacy DB (data preserved, idempotent, fresh DB, backup file created once); legacy session JWT accepted; legacy unsubscribe token accepted; registry with Plex only; provider-aware `SessionUser` round trip.
- Existing tests unchanged in behavior. One pre-existing failure in `tests/api/dashboard-stats.test.ts` (`recentHistory` empty) is out of scope.
- Final gate: real `next build` (catches any Edge-runtime import regression) and `tsc --noEmit`.

## Delivery

Feature branch `feat/media-server-abstraction`, PR on `titi69lpb/portarr`, executed with subagent-driven development (implementer + reviewer per task). No tag until the whole Jellyfin effort ships; if a release is cut, create the GitHub Release explicitly after the tag.

## Out of scope

Any Jellyfin code (sub-projects 2 and 3), account merging, encryption at rest, the private `plexcrew-portal` repo (Portarr is not a git fork of it and this is native Portarr work).
