# Admin config wizard — design spec

**Date:** 2026-09-16
**Status:** Approved by user, ready for implementation planning
**Scope:** Portarr only (public repo). Not applied to the private plexcrew-portal repo, which stays env-managed.

## Problem

Portarr currently requires 21 environment variables to be set before the app will even boot (`REQUIRED_VARS` in `src/lib/config.ts`, checked by `loadConfig()`, which throws synchronously if any is missing). A self-hoster has to hand-edit a `.env` file for Plex/Tautulli/Sonarr/Radarr/Overseerr/SMTP before ever seeing the app run. This is the "Sous-projet 2" gap already noted when Portarr was first published: an admin UI to configure these services without editing env vars.

## Goals

- A self-hoster can start the container with (almost) no env vars set and configure everything through a first-run setup wizard in the browser.
- Existing installs that already set these env vars in `.env` keep working exactly as today — zero migration required, full backwards compatibility with the published install docs.
- Settings can be edited later (not just at first boot) via an owner-only admin page.
- Out of scope: Jellyfin support (separate brainstorm/spec to follow), encryption-at-rest for stored secrets (same plaintext trust boundary as the current `.env` file), live Plex OAuth token exchange during setup (v1 is paste-in, same as Sonarr/Radarr/Overseerr API keys today).

## Storage & precedence

New SQLite table, `settings` (key TEXT PRIMARY KEY, value TEXT), added to the existing schema in `src/lib/db.ts`. Portarr has no such table today (unlike plexcrew-portal, which has one for i18n locale — not present here since Portarr has no i18n).

`loadConfig()` resolves every configurable field as:

```
value = env[KEY] ?? dbSettings[KEY] ?? null
```

Env wins whenever set — this is what preserves full backwards compatibility for existing installs. `better-sqlite3` is a *synchronous* driver, so this DB read adds no async requirement — `loadConfig()` stays fully synchronous, and none of its 33 existing call sites across 30 files need to change signature.

`AppConfig`'s shape changes: fields that are today `string` (required) become `string | null` for the services in scope (Plex, Tautulli, Sonarr, Radarr, Overseerr, SMTP, `publicBaseUrl`). Callers that currently assume these are always present need a "is setup complete" guard (see Middleware section) rather than per-call-site null checks — the middleware redirect means, by the time any real page/route runs its normal logic, these fields are guaranteed non-null. `filesRootPath`/`downloadSigningSecret`/`downloadProxyUrl`/`kuma`/`shortcuts`/`storageVolumes`/`fsTimeoutMs` are already-optional fields and are unaffected by this change — they stay env-only, not part of this wizard.

**Auto-generated, invisible secrets** — never asked in the wizard, never shown as an editable setting. On first boot, if not already set via env, each is generated once and persisted to the `settings` table (reused on every subsequent boot):
- `SESSION_SECRET`
- `PLEX_CLIENT_IDENTIFIER` (an arbitrary stable UUID Portarr presents to plex.tv — no reason to make a self-hoster invent one)
- `NEWSLETTER_CRON_SECRET`
- `DOWNLOAD_SIGNING_SECRET`

`DATABASE_PATH` is excluded entirely from this system — it's a pure infra/bootstrap concern (where the SQLite file lives on disk), gets a hardcoded default baked into the Docker image, and is never a "setting" a self-hoster configures through the UI.

## First-run flow & `/setup` security

`loadConfig()` no longer throws at boot. A new helper, `isSetupComplete(config)`, checks that Plex/Tautulli/Sonarr/Radarr/Overseerr/SMTP/`publicBaseUrl` are all present. Middleware: if `!isSetupComplete(config)`, every request except `/setup*` (and its own API routes) redirects to `/setup`.

**Setup token:** on first boot, if setup is not yet complete and no setup token exists in the `settings` table, generate one (same random-generation helper as the other auto-secrets) and log it once to stdout — visible via `docker logs`, no new env var to invent, no password for the self-hoster to pick. `/setup` requires this token (as a query param that gets stored in a short-lived cookie on first successful entry, so the self-hoster doesn't have to keep pasting it into every step) until the wizard fully completes. On completion, the token row is deleted — `/setup` becomes unreachable afterward, and further edits go through the normal `isOwner`-gated `/admin/settings` (see below).

This intentionally does not protect the window between container start and the self-hoster's first visit to the logged token — same trust model as e.g. Vaultwarden/Immich's first-run tokens: whoever controls the container's logs controls setup, which is an acceptable bar for a self-hosted single-owner app.

## Wizard steps

One step per concern, each service step has a mandatory "Tester" button that calls the real upstream API and blocks the "Suivant"/save action until it succeeds. Failures show the actual upstream error (timeout, 401, connection refused) inline, not a generic message.

1. **URL publique du site** (`publicBaseUrl`) — just a URL field, no test (nothing to call yet).
2. **Plex** — server URL + server token (paste-in; a help link explains how to find the token, e.g. the standard `X-Plex-Token` lookup via a media file's "Get Info" XML view). Test: `GET /identity` against the given URL+token.
3. **Tautulli** — URL + API key. Test: a lightweight authenticated call (e.g. `get_server_info`).
4. **Sonarr** — URL + API key. Test: `GET /api/v3/system/status`.
5. **Radarr** — URL + API key. Test: `GET /api/v3/system/status`.
6. **Overseerr** — URL + API key. Test: `GET /api/v1/status`.
7. **SMTP** — host, port, user, pass, from address, from name. Test: sends a real test email to the from-address being configured.

Each step's form component is shared with `/admin/settings` (see below) rather than duplicated.

## Post-setup editing (`/admin/settings`)

New page, gated by the same `isOwner` session check already used by `/admin`. Reuses the wizard's per-service form components. Each field pre-fills from `loadConfig()`'s resolved value.

**Secret fields** (API keys, SMTP password, Plex server token) render as a masked placeholder for an already-set value and only overwrite on save if the admin types a new value — the real secret is never round-tripped back into page source.

**Env-sourced fields are disabled.** Since env still wins over DB, editing a field whose current value comes from an env var would silently do nothing (DB write happens, but `loadConfig()` keeps preferring env next request) — this is a real trap, not a hypothetical. To avoid it: `loadConfig()` gets a sibling helper, `getConfigSources(env)`, returning which of the in-scope keys are currently set via env (vs DB vs unset). The settings UI uses this to render env-sourced fields as disabled, with an inline note: "Défini via variable d'environnement — modifiez le `.env` pour changer."

## Testing

- Unit tests: settings resolution precedence (env > DB > null) in `loadConfig()`, `getConfigSources()`, setup-token generation/lookup/invalidation lifecycle, each service's connection-test function (mocked fetch, same pattern as existing `lib/*.ts` tests), the disabled-when-env-sourced rendering logic.
- No new e2e/browser test infra introduced — manual verification via the existing signed-session-cookie + Playwright technique already used throughout this repo's history (see prior PR notes in the private repo's memory for the exact recipe), run once before merge to confirm the wizard → configured-app transition actually works end to end, not just that units pass.

## Migration note for existing installs

None required. An install with all env vars already set has `isSetupComplete()` return true immediately on the first boot after upgrade — `/setup` is never reached, `/admin/settings` shows every field disabled (all env-sourced), behavior is byte-identical to today.

## Documentation updates needed

`.env.example` and the GitHub wiki's "Installation"/"Configuration Reference" pages currently present these 21 vars as required. They need a pass explaining the new wizard path and clarifying that setting them via env is now optional (still supported, still takes precedence) rather than mandatory. Tracked as a task in the implementation plan, not detailed further here.
