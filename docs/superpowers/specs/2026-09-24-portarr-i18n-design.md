# Portarr i18n (FR/EN) - design

Issue: titi69lpb/portarr#7 "Language support". Source of truth for the port: private plexcrew-portal (i18n Phases 1-4, profile page, PR #59-#65).

## Goal
Portarr is fully translatable (FR/EN), with the same language options as plexcrew-portal, plus a language choice in the first-run setup.

## Scope
1. **i18n core**: `lib/i18n/{locale,translate,dictionaries/{fr,en,index}}.ts`, `t(locale,key,vars)`, FR fallback. Root layout resolves locale and sets `<html lang>`.
2. **Locale resolution** (per request): personal `users.locale` (new nullable column, migration) > instance `default_locale` setting > browser `Accept-Language` (EN unless it starts with `fr`; used only when no default_locale is stored AND the instance was created after this release) > FR. Existing installs with no stored default keep FR (no behaviour change on upgrade).
3. **Translation** of user portal, admin area, Portarr-only surfaces (setup wizard, admin settings, Jellyfin login, service field labels in `settings-schema.ts`), outbound emails (newsletter, mail shell, availability notifications).
4. **Profile page** `/profile` + sidebar button + `LanguageSwitcher` (personal override, "follow instance default" reset) aligned with plexcrew. Users keyed by Portarr's media-provider identity (Plex or Jellyfin), not plex_id only.
5. **Admin default language** section in `/admin/settings` (FR/EN toggle, `POST /api/admin/settings/locale`, owner only).
6. **Setup wizard**: first step is a language picker (FR/EN), preselected from Accept-Language. Wizard re-renders in the chosen language immediately; choice saved as `default_locale`.
7. Docs (README FR/EN, wiki config page) + release v1.8.0, reply to issue #7 (do not close without user approval).

## Non-goals
Other languages than FR/EN; translating user-generated content.

## Testing
Unit tests for `t()`, locale resolution order (personal, default, Accept-Language, FR), locale routes (auth, validation); dictionary parity test (every FR key exists in EN and vice versa); `tsc --noEmit`, lint, full test suite and build green; manual check on portarr-test.

## Delivery
Subagent-driven development, phased: (A) core+resolution+migration, (B) user portal, (C) admin + settings + setup wizard + Jellyfin surfaces, (D) emails, (E) profile page + admin/setup language controls, (F) docs + release. Never push private data (anonymize, see memory).
