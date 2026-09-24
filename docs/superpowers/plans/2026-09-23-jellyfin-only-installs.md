# Jellyfin-only installs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Portarr run with only Jellyfin configured (no Plex, no Tautulli), by relaxing `isSetupComplete`'s hard Plex+Tautulli requirement and fixing every place that still assumes `config.plex`/`config.tautulli` are non-null once setup is complete.

**Architecture:** `isSetupComplete` drops its explicit Plex/Tautulli clause and relies solely on the already-correct `getActiveProviders(config).length > 0` (which itself already only activates Plex when Tautulli is present too, and always activates Jellyfin when configured). `ConfiguredAppConfig.plex`/`.tautulli` go back to nullable, and every real compile break that causes gets fixed by hand — a `config.plex.serverName` newsletter dependency becomes a new generic `communityName` setting, and Tautulli-only mailing-group targeting becomes provider-aware via the existing `ActivitySource` registry from sub-project 3a.

**Tech Stack:** Next.js 14 (App Router), TypeScript strict, vitest.

**Spec:** `docs/superpowers/specs/2026-09-23-jellyfin-only-installs-design.md`

## Global Constraints

- **Scope:** Plex and Tautulli stay coupled as a pair (Plex never activates without Tautulli, unchanged from today) — what changes is that the pair becomes optional when Jellyfin is configured instead. Decoupling Plex from Tautulli internally is explicitly out of scope. Sonarr/Radarr/Overseerr/SMTP/public URL stay unconditionally required.
- **Exhaustive break list**: this plan's Task 1 loosens `ConfiguredAppConfig.plex`/`.tautulli` to nullable and the resulting `tsc --noEmit` break list was enumerated in full during planning (2026-09-23, against the tip of `main` at the time, commit `ca07607` — the same commit `feat/jellyfin-only-installs` branches from): exactly 7 errors across `src/app/api/admin/mail/send/route.ts` (2), `src/app/api/admin/newsletter/send/route.ts` (3), `src/app/api/cron/request-availability/route.ts` (1), `tests/lib/config.test.ts` (1). Every task below accounts for one of these. If your own `tsc --noEmit` run after Task 1 shows a different set (because other work landed on `main` in the meantime), treat the plan's file list as incomplete rather than the compiler as wrong — fix whatever it actually reports, following the same pattern (nullable-safe access, no non-null assertions) as the fixes below.
- **`PortalUser` (from `src/lib/members.ts`) already structurally satisfies `ActivityMember`** (`{provider, userId, email, username}`, both from `src/lib/activity/types.ts`) — no new type or conversion needed to pass a `PortalUser` anywhere an `ActivityMember` is expected.
- **Edge runtime:** none of this plan's touched files are imported by `src/middleware.ts` — no Edge constraint applies here, same as sub-project 3a.
- **Known pre-existing failure:** `tests/api/dashboard-stats.test.ts` (`recentHistory` empty) fails on `main` before any change in this plan. Do not fix it, do not count it as a regression.
- **Commits:** end every commit message with a second `-m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"`. Work only on branch `feat/jellyfin-only-installs` (already checked out, based directly on `main` — sub-projects 1–3a are merged and released through v1.6.1, no stacking needed); never push and never touch `main` unless the user asks.
- **Working directory:** the repo root of the feature-branch clone (the directory containing `package.json`), currently a local path. All paths below are relative to it.
- **No version bump, no tag, no GitHub Release, no wiki update** as part of this plan — those happen only when the user explicitly asks, same as every previous sub-project.

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/config.ts` | `isSetupComplete` relaxed; `ConfiguredAppConfig.plex`/`.tautulli` nullable; new `AppConfig.communityName: string` (always resolved, never null) |
| `src/lib/settings-schema.ts` | `publicBaseUrl`'s field list gains `PUBLIC_COMMUNITY_NAME` |
| `src/components/SetupWizard.tsx` | `onSkip` extended to the `plex` and `tautulli` steps |
| `src/app/api/admin/newsletter/send/route.ts`, `src/app/api/cron/request-availability/route.ts` | `config.plex.serverName` → `config.communityName` |
| `src/lib/mail-recipients.ts` | `resolveRecipients`/`selectRecipients` take `ActivitySource[]` instead of a raw Tautulli context; group filtering goes through the provider-aware `lastSeen` |
| `src/app/api/admin/mail/send/route.ts` | Passes `getActivitySources(config)` instead of a hand-built Tautulli context |
| `.env.example`, `README.md` | Document `PUBLIC_COMMUNITY_NAME`; fix the stale "×6 shortcuts" README table row left over from the v1.6.1 sidebar-shortcuts release (should be ×8, including Jellyfin/Jellystat) |

---

### Task 1: Relax `isSetupComplete`, make `plex`/`tautulli` nullable, add `communityName`

**Files:**
- Modify: `src/lib/config.ts`
- Modify: `tests/lib/config.test.ts`
- Test: `tests/lib/config.test.ts` (same file — new tests added, one existing test fixed)

**Interfaces:**
- Produces: `AppConfig.communityName: string` (new field, always a non-empty string — never null, computed once in `loadConfig`). `ConfiguredAppConfig.plex: PlexConfig | null`, `ConfiguredAppConfig.tautulli: TautulliConfig | null` (both now nullable, matching `AppConfig` exactly — the interface no longer needs to redeclare them at all, since it now inherits both as-is from `AppConfig extends`).
- Consumes: nothing new.

- [ ] **Step 1: Write the failing tests**

Add to `tests/lib/config.test.ts`, after the existing `describe('loadConfig — fully configured via env (backwards compat)', ...)` block's closing brace (find it by searching for the first `});` that closes a top-level `describe`):

```ts
const JELLYFIN_ONLY_ENV = {
  NODE_ENV: 'test' as const,
  DATABASE_PATH: ':memory:',
  SESSION_SECRET: 'test-secret-at-least-32-characters-long',
  PUBLIC_BASE_URL: 'https://portal.example.com',
  JELLYFIN_URL: 'https://jellyfin.example.com',
  JELLYFIN_API_KEY: 'jfkey',
  SONARR_URL: 'https://sonarr.example.com',
  SONARR_API_KEY: 'skey',
  RADARR_URL: 'https://radarr.example.com',
  RADARR_API_KEY: 'rkey',
  OVERSEERR_URL: 'https://overseerr.example.com',
  OVERSEERR_API_KEY: 'overseerr-key',
  SMTP_HOST: 'mail.example.com',
  SMTP_PORT: '465',
  SMTP_USER: 'smtpuser',
  SMTP_PASS: 'smtppass',
  MAIL_FROM_ADDRESS: 'admin@example.com',
  MAIL_FROM_NAME: 'Portarr',
};

describe('isSetupComplete — Jellyfin-only installs (sub-project 3b)', () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it('is true with only Jellyfin configured, no Plex, no Tautulli', () => {
    const config = loadConfig(JELLYFIN_ONLY_ENV, getDb(':memory:'));
    expect(config.plex).toBeNull();
    expect(config.tautulli).toBeNull();
    expect(isSetupComplete(config)).toBe(true);
  });

  it('is false with neither Plex+Tautulli nor Jellyfin configured', () => {
    const { PLEX_URL, PLEX_SERVER_TOKEN, PLEX_SERVER_NAME, TAUTULLI_URL, TAUTULLI_API_KEY, JELLYFIN_URL, JELLYFIN_API_KEY, ...rest } = {
      ...JELLYFIN_ONLY_ENV,
    } as Record<string, string>;
    const config = loadConfig(rest, getDb(':memory:'));
    expect(isSetupComplete(config)).toBe(false);
  });

  it('is still true with only Plex+Tautulli configured (backwards compat, no Jellyfin)', () => {
    const config = loadConfig(FULL_ENV, getDb(':memory:'));
    expect(isSetupComplete(config)).toBe(true);
  });

  it('assertConfigured no longer throws for a Jellyfin-only install, and plex/tautulli stay null', () => {
    const config = assertConfigured(loadConfig(JELLYFIN_ONLY_ENV, getDb(':memory:')));
    expect(config.plex).toBeNull();
    expect(config.tautulli).toBeNull();
  });
});

describe('communityName', () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it('uses PUBLIC_COMMUNITY_NAME when set', () => {
    const config = loadConfig({ ...FULL_ENV, PUBLIC_COMMUNITY_NAME: 'The Crew' }, getDb(':memory:'));
    expect(config.communityName).toBe('The Crew');
  });

  it('falls back to PLEX_SERVER_NAME when PUBLIC_COMMUNITY_NAME is unset', () => {
    const config = loadConfig(FULL_ENV, getDb(':memory:'));
    expect(config.communityName).toBe('My Plex Server');
  });

  it('falls back to "Portarr" when neither is set', () => {
    const config = loadConfig(JELLYFIN_ONLY_ENV, getDb(':memory:'));
    expect(config.communityName).toBe('Portarr');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/lib/config.test.ts`
Expected: FAIL — `isSetupComplete` still requires Plex+Tautulli, `communityName` doesn't exist on `AppConfig` yet (TypeScript error, which vitest surfaces as a failure to even run the file).

- [ ] **Step 3: Fix the one pre-existing test that will break — `assertConfigured does not throw and narrows every service to non-null`**

Find this test in `tests/lib/config.test.ts`:

```ts
  it('assertConfigured does not throw and narrows every service to non-null', () => {
    const db = getDb(':memory:');
    const config = assertConfigured(loadConfig(FULL_ENV, db));
    expect(config.plex.url).toBe('https://plex.example.com');
  });
```

Change its last line to:

```ts
    expect(config.plex?.url).toBe('https://plex.example.com');
```

(This test still exercises the fully-configured, backwards-compatible path — `config.plex` is genuinely non-null here since `FULL_ENV` configures Plex — but the type is now `PlexConfig | null`, so the access must be null-safe even though the runtime value is never actually null in this specific test.)

- [ ] **Step 4: Implement the `isSetupComplete` and `ConfiguredAppConfig` changes**

In `src/lib/config.ts`, find:

```ts
export function isSetupComplete(config: AppConfig): boolean {
  return (
    // Jellyfin runs alongside Plex + Tautulli in this sub-project, so both stay required: this is what
    // makes assertConfigured's cast sound. Sub-project 3 relaxes it (Jellyfin-only, Tautulli optional).
    config.plex !== null &&
    config.tautulli !== null &&
    getActiveProviders(config).length > 0 &&
    config.sonarr !== null &&
    config.radarr !== null &&
    config.overseerr !== null &&
    config.smtp !== null &&
    config.publicBaseUrl !== null
  );
}
```

Replace with:

```ts
export function isSetupComplete(config: AppConfig): boolean {
  return (
    // At least one media provider must be fully active. getActiveProviders already encodes
    // the right per-provider rule: Plex only counts when Tautulli is also configured (it has
    // no native activity source), Jellyfin counts on its own (native or Jellystat activity).
    getActiveProviders(config).length > 0 &&
    config.sonarr !== null &&
    config.radarr !== null &&
    config.overseerr !== null &&
    config.smtp !== null &&
    config.publicBaseUrl !== null
  );
}
```

Immediately below it, find:

```ts
// plex/tautulli stay non-null here because isSetupComplete still requires them; sub-project 3 (Jellyfin-only installs) relaxes this.
export interface ConfiguredAppConfig extends AppConfig {
  plex: PlexConfig;
  tautulli: TautulliConfig;
  sonarr: SonarrConfig;
  radarr: RadarrConfig;
  overseerr: OverseerrConfig;
  smtp: SmtpConfig;
  publicBaseUrl: string;
}
```

Replace with:

```ts
export interface ConfiguredAppConfig extends AppConfig {
  sonarr: SonarrConfig;
  radarr: RadarrConfig;
  overseerr: OverseerrConfig;
  smtp: SmtpConfig;
  publicBaseUrl: string;
}
```

(`plex`/`tautulli` are dropped from the narrowing list entirely — they now stay whatever `AppConfig` already declares them as, `PlexConfig | null`/`TautulliConfig | null`, inherited unchanged via `extends AppConfig`.)

- [ ] **Step 5: Add `communityName`**

In `src/lib/config.ts`, add to the `AppConfig` interface, right after the `smtp: SmtpConfig | null;` line:

```ts
  communityName: string;
```

In `loadConfig`, right after the block that computes `smtp` (after its closing `: null;` line, before the `const publicBaseUrl = v('PUBLIC_BASE_URL');` line), add:

```ts

  const communityName = v('PUBLIC_COMMUNITY_NAME') ?? plexServerName ?? 'Portarr';
```

In the object `loadConfig` returns, add `communityName,` right after the `smtp,` line.

Add `'PUBLIC_COMMUNITY_NAME',` to `CONFIGURABLE_KEYS`, right after the `'PUBLIC_BASE_URL',` entry.

- [ ] **Step 6: Run to verify they pass, then the whole suite**

```bash
npx vitest run tests/lib/config.test.ts 2>&1 | tail -20
npm run typecheck 2>&1 | tail -30
```

Expected: the new/fixed tests in `config.test.ts` PASS. `npm run typecheck` will still show the other 6 pre-identified errors (in `admin/mail/send/route.ts`, `admin/newsletter/send/route.ts`, `cron/request-availability/route.ts`) — that's expected at this point in the plan; those get fixed in later tasks. Confirm the *only* remaining errors are exactly those 6, in exactly those 3 files, matching the Global Constraints' enumerated list (2+3+1). If `tsc` shows anything else, stop and report it — the plan's break-list assumption no longer holds and the controller needs to know before continuing.

- [ ] **Step 7: Commit**

```bash
git add src/lib/config.ts tests/lib/config.test.ts
git commit -m "feat: relax isSetupComplete for Jellyfin-only installs, add communityName" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `PUBLIC_COMMUNITY_NAME` field + skippable Plex/Tautulli wizard steps

**Files:**
- Modify: `src/lib/settings-schema.ts`
- Modify: `src/components/SetupWizard.tsx`
- Test: `tests/lib/settings-schema.test.ts`

**Interfaces:**
- Consumes: nothing new (this task is purely additive UI wiring on top of Task 1's `communityName`/`PUBLIC_COMMUNITY_NAME`).
- Produces: `SERVICE_FIELDS.publicBaseUrl` gains a second `FieldDef`. No new exported functions.

- [ ] **Step 1: Write the failing test**

Find the existing test in `tests/lib/settings-schema.test.ts` that asserts `SERVICE_FIELDS.publicBaseUrl`'s shape (search for `publicBaseUrl` in that file) and note its current exact assertion, then add this new test right after it:

```ts
  it('publicBaseUrl also carries the optional community-name field', () => {
    expect(SERVICE_FIELDS.publicBaseUrl.map((f) => f.envKey)).toEqual(['PUBLIC_BASE_URL', 'PUBLIC_COMMUNITY_NAME']);
    const communityNameField = SERVICE_FIELDS.publicBaseUrl.find((f) => f.envKey === 'PUBLIC_COMMUNITY_NAME');
    expect(communityNameField?.type).toBe('text');
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/lib/settings-schema.test.ts`
Expected: FAIL — `SERVICE_FIELDS.publicBaseUrl` only has one field so far.

- [ ] **Step 3: Add the field**

In `src/lib/settings-schema.ts`, find:

```ts
  publicBaseUrl: [
    { envKey: 'PUBLIC_BASE_URL', label: 'URL publique de Portarr (ex. https://portarr.example.com)', type: 'text' },
  ],
```

Replace with:

```ts
  publicBaseUrl: [
    { envKey: 'PUBLIC_BASE_URL', label: 'URL publique de Portarr (ex. https://portarr.example.com)', type: 'text' },
    {
      envKey: 'PUBLIC_COMMUNITY_NAME',
      label: 'Nom affiché dans la newsletter et les notifications (optionnel, sinon le nom du serveur Plex, ou « Portarr »)',
      type: 'text',
    },
  ],
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/lib/settings-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Make the Plex and Tautulli wizard steps skippable**

In `src/components/SetupWizard.tsx`, find:

```tsx
        onSkip={step === 'jellyfin' || step === 'jellystat' ? () => setStepIndex(stepIndex + 1) : undefined}
```

Replace with:

```tsx
        onSkip={
          step === 'plex' || step === 'tautulli' || step === 'jellyfin' || step === 'jellystat'
            ? () => setStepIndex(stepIndex + 1)
            : undefined
        }
```

No other change needed in this file — skipping a step already just advances `stepIndex` without submitting that step's fields, leaving them unset in the DB exactly like skipping Jellyfin/Jellystat already does today; `isSetupComplete` (Task 1) is what actually gates whether the resulting configuration is valid once the wizard finishes.

- [ ] **Step 6: Verify manually that this doesn't change any existing test's expectations**

Run: `npx vitest run 2>&1 | tail -15`
Expected: same pass count as before this task (no test currently asserts on `SetupWizard`'s `onSkip` prop directly, per a check of `tests/components/` — this step just confirms that assumption holds; if a test *does* break, read it and update its expectation to include `plex`/`tautulli` as skippable, following the same shape as whatever it already asserts for `jellyfin`/`jellystat`).

- [ ] **Step 7: Commit**

```bash
git add src/lib/settings-schema.ts src/components/SetupWizard.tsx tests/lib/settings-schema.test.ts
git commit -m "feat: add the PUBLIC_COMMUNITY_NAME field, make Plex/Tautulli wizard steps skippable" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Replace `config.plex.serverName` with `config.communityName`

**Files:**
- Modify: `src/app/api/admin/newsletter/send/route.ts`
- Modify: `src/app/api/cron/request-availability/route.ts`

**Interfaces:**
- Consumes: `AppConfig.communityName` (Task 1).
- Produces: nothing new — this task only removes usages of `config.plex.serverName`, restoring `npm run typecheck` to clean for these two files.

- [ ] **Step 1: `admin/newsletter/send/route.ts`**

In `src/app/api/admin/newsletter/send/route.ts`, there are exactly 3 occurrences of `config.plex.serverName`. Replace each with `config.communityName`:

1. `const subject = \`Les Nouveautés ${config.plex.serverName}! (${endDate})\`;` → `const subject = \`Les Nouveautés ${config.communityName}! (${endDate})\`;`
2. In the `archiveHtml` call: `renderNewsletterHtml(items, config.plex.serverName, endDate, posterBaseUrl, ...)` → `renderNewsletterHtml(items, config.communityName, endDate, posterBaseUrl, ...)`
3. In the per-recipient `html` call inside the `for (const recipient of recipients)` loop: same substitution, `renderNewsletterHtml(items, config.plex.serverName, endDate, posterBaseUrl, unsubscribeUrl, ...)` → `renderNewsletterHtml(items, config.communityName, endDate, posterBaseUrl, unsubscribeUrl, ...)`

- [ ] **Step 2: `cron/request-availability/route.ts`**

In `src/app/api/cron/request-availability/route.ts`, find:

```ts
      const markdownBody = `# ${item.title} est disponible !\n\nBonjour ${item.requesterUsername},\n\nVotre demande **${item.title}** est maintenant disponible sur ${config.plex.serverName}. Bon visionnage !`;
```

Replace with:

```ts
      const markdownBody = `# ${item.title} est disponible !\n\nBonjour ${item.requesterUsername},\n\nVotre demande **${item.title}** est maintenant disponible sur ${config.communityName}. Bon visionnage !`;
```

- [ ] **Step 3: Verify**

```bash
npm run typecheck 2>&1 | tail -20
```

Expected: the 4 errors that were in these two files are gone. `admin/mail/send/route.ts`'s 2 errors remain — that's Task 4's job.

Check for any existing test asserting the literal newsletter subject or availability-email body text (search `tests/` for `Les Nouveautés` or `est maintenant disponible sur`) — if found, update its expected server name to whatever `communityName` resolves to in that test's env (likely still `PLEX_SERVER_NAME`'s value, since existing tests configure Plex and won't set `PUBLIC_COMMUNITY_NAME`, so the fallback chain lands on the same value as before — no behavior change for those tests, just confirm this explicitly rather than assume it).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/admin/newsletter/send/route.ts src/app/api/cron/request-availability/route.ts
git commit -m "fix: use the new communityName setting instead of config.plex.serverName" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Provider-aware mailing group targeting

**Files:**
- Modify: `src/lib/mail-recipients.ts`
- Modify: `src/app/api/admin/mail/send/route.ts`
- Modify: `tests/lib/mail-recipients.test.ts`

**Interfaces:**
- Consumes: `PortalUser`/`listUsers` (`src/lib/members.ts`, existing, unchanged — `listUsers(db): PortalUser[]`, `PortalUser { provider, userId, username, email, lastLogin }`); `ActivitySource`, `ActivityMember` (`src/lib/activity/types.ts`, existing); `getActivitySourceFor` (`src/lib/activity/registry.ts`, existing, signature `(sources: ActivitySource[], provider: ProviderId) => ActivitySource | null`); `getActivitySources` (`src/lib/activity/registry.ts`, existing); `fakeSource` (`tests/lib/activity/fake-source.ts`, existing, signature `(id: ProviderId, overrides?: Partial<ActivitySource>) => ActivitySource`).
- Produces: `resolveRecipients(db: Database.Database, params: RecipientParams, sources: ActivitySource[]): Promise<Recipient[]>` — same name and `Recipient`/`RecipientParams` types as today, but the third parameter changes from `{url, apiKey}` to `ActivitySource[]`. `RecipientDeps`/`defaultRecipientDeps` are removed entirely (no longer needed — the injection point is now `sources`, itself already testable via `fakeSource`).

- [ ] **Step 1: Rewrite `tests/lib/mail-recipients.test.ts`**

Replace the entire file with:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getDb, resetDbForTests } from '../../src/lib/db';
import { resolveRecipients, dedupeRecipientsByEmail } from '../../src/lib/mail-recipients';
import { fakeSource } from './activity/fake-source';

function seedUsers(db: ReturnType<typeof getDb>) {
  const insert = db.prepare(
    "INSERT INTO users (provider, external_id, email, username, last_login) VALUES ('plex', ?, ?, ?, ?)"
  );
  insert.run('1', 'alice@example.com', 'alice', new Date().toISOString());
  insert.run('2', 'bob@example.com', 'bob', new Date().toISOString());
  insert.run('3', 'carol@example.com', 'carol', new Date().toISOString());
}

describe('resolveRecipients', () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it('broadcast returns every user', async () => {
    const db = getDb(':memory:');
    seedUsers(db);
    const result = await resolveRecipients(db, { mode: 'broadcast' }, [fakeSource('plex')]);
    expect(result.map((r) => r.email).sort()).toEqual([
      'alice@example.com',
      'bob@example.com',
      'carol@example.com',
    ]);
  });

  it('individual returns only the matched emails, case-insensitively', async () => {
    const db = getDb(':memory:');
    seedUsers(db);
    const result = await resolveRecipients(
      db,
      { mode: 'individual', emails: ['ALICE@example.com', 'carol@example.com'] },
      [fakeSource('plex')]
    );
    expect(result.map((r) => r.username).sort()).toEqual(['alice', 'carol']);
  });

  it('group activeSince returns users seen within the window, resolved through the plex activity source', async () => {
    const db = getDb(':memory:');
    seedUsers(db);
    const now = Date.now();
    const lastSeenByEmail: Record<string, string | null> = {
      alice: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString(),
      bob: new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString(),
      carol: null,
    };
    const source = fakeSource('plex', {
      lastSeen: async (member) => lastSeenByEmail[member.username] ?? null,
    });
    const result = await resolveRecipients(db, { mode: 'group', filter: { type: 'activeSince', days: 30 } }, [source]);
    expect(result.map((r) => r.username)).toEqual(['alice']);
  });

  it('group neverActive returns users with no recorded activity', async () => {
    const db = getDb(':memory:');
    seedUsers(db);
    const now = Date.now();
    const lastSeenByEmail: Record<string, string | null> = {
      alice: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString(),
      bob: null,
    };
    const source = fakeSource('plex', {
      lastSeen: async (member) => lastSeenByEmail[member.username] ?? null,
    });
    const result = await resolveRecipients(db, { mode: 'group', filter: { type: 'neverActive' } }, [source]);
    // carol has no activity record at all, which also counts as never active
    expect(result.map((r) => r.username).sort()).toEqual(['bob', 'carol']);
  });

  it('a member whose provider has no active source is treated as never active', async () => {
    const db = getDb(':memory:');
    const insert = db.prepare(
      "INSERT INTO users (provider, external_id, email, username, last_login) VALUES ('jellyfin', 'j1', 'dana@example.com', 'dana', '')"
    );
    insert.run();
    // Only a plex source is active — the jellyfin member has no matching ActivitySource.
    const result = await resolveRecipients(db, { mode: 'group', filter: { type: 'neverActive' } }, [fakeSource('plex')]);
    expect(result.map((r) => r.username)).toEqual(['dana']);
  });
});

describe('dedupeRecipientsByEmail', () => {
  it('keeps the first recipient of each address, case-insensitively, preserving order', () => {
    const result = dedupeRecipientsByEmail([
      { email: 'Alice@Example.com', username: 'alice-plex' },
      { email: 'bob@example.com', username: 'bob' },
      { email: 'alice@example.com', username: 'alice-jf' },
    ]);
    expect(result.map((r) => r.username)).toEqual(['alice-plex', 'bob']);
  });

  it('returns distinct addresses untouched', () => {
    const input = [
      { email: 'a@example.com', username: 'a' },
      { email: 'b@example.com', username: 'b' },
    ];
    expect(dedupeRecipientsByEmail(input)).toEqual(input);
  });
});

describe('resolveRecipients with one address shared by two members', () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it('mails the shared address once in every mode', async () => {
    const db = getDb(':memory:');
    const insert = db.prepare(
      "INSERT INTO users (provider, external_id, email, username, last_login) VALUES (?, ?, ?, ?, '')"
    );
    insert.run('plex', '1', 'shared@example.com', 'alice');
    insert.run('jellyfin', 'j1', 'Shared@Example.com', 'alice-jf');
    const sources = [fakeSource('plex'), fakeSource('jellyfin')];

    expect(await resolveRecipients(db, { mode: 'broadcast' }, sources)).toHaveLength(1);
    expect(
      await resolveRecipients(db, { mode: 'individual', emails: ['shared@example.com'] }, sources)
    ).toHaveLength(1);
    expect(
      await resolveRecipients(db, { mode: 'group', filter: { type: 'neverActive' } }, sources)
    ).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify the tests fail**

Run: `npx vitest run tests/lib/mail-recipients.test.ts`
Expected: FAIL — `resolveRecipients` still expects a `deps`/`tautulliCtx` pair of arguments, not a bare `ActivitySource[]`, and `RecipientDeps` import will fail to resolve once the old signature is gone (it won't be gone yet at this point — the test file is rewritten first, so at this exact moment the failure is a type/argument-count mismatch against the *still-old* implementation).

- [ ] **Step 3: Rewrite `src/lib/mail-recipients.ts`**

Replace the entire file with:

```ts
import type Database from 'better-sqlite3';
import { listUsers } from './members';
import { getActivitySourceFor } from './activity/registry';
import type { ActivitySource } from './activity/types';

export interface Recipient {
  email: string;
  username: string;
}

export type RecipientParams =
  | { mode: 'broadcast' }
  | { mode: 'individual'; emails: string[] }
  | { mode: 'group'; filter: { type: 'activeSince'; days: number } | { type: 'neverActive' } };

// One person can be a Plex and a Jellyfin member sharing an address: mail it once (first wins).
export function dedupeRecipientsByEmail<T extends { email: string }>(recipients: T[]): T[] {
  const seen = new Set<string>();
  return recipients.filter((r) => {
    const key = r.email.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function resolveRecipients(
  db: Database.Database,
  params: RecipientParams,
  sources: ActivitySource[]
): Promise<Recipient[]> {
  return dedupeRecipientsByEmail(await selectRecipients(db, params, sources));
}

async function selectRecipients(
  db: Database.Database,
  params: RecipientParams,
  sources: ActivitySource[]
): Promise<Recipient[]> {
  const allUsers = listUsers(db).filter((u) => u.email !== '');

  if (params.mode === 'broadcast') {
    return allUsers.map((u) => ({ email: u.email, username: u.username }));
  }

  if (params.mode === 'individual') {
    const wanted = new Set(params.emails.map((e) => e.toLowerCase()));
    return allUsers.filter((u) => wanted.has(u.email.toLowerCase())).map((u) => ({ email: u.email, username: u.username }));
  }

  // Group filter: resolve each member's last-seen activity through whichever
  // source matches their own provider — a member whose provider has no active
  // source (shouldn't happen once every configured provider has at least a
  // degraded activity source) is treated as never active, same as a real "no
  // record" result would be.
  const withLastSeen = await Promise.all(
    allUsers.map(async (u) => {
      const source = getActivitySourceFor(sources, u.provider);
      const lastSeenAt = source ? await source.lastSeen(u) : null;
      return { user: u, lastSeenAt };
    })
  );

  return withLastSeen
    .filter(({ lastSeenAt }) => {
      if (params.filter.type === 'neverActive') return lastSeenAt === null;
      if (lastSeenAt === null) return false;
      const cutoff = Date.now() - params.filter.days * 24 * 60 * 60 * 1000;
      return new Date(lastSeenAt).getTime() >= cutoff;
    })
    .map(({ user }) => ({ email: user.email, username: user.username }));
}
```

- [ ] **Step 4: Run to verify the tests pass**

Run: `npx vitest run tests/lib/mail-recipients.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the call site**

In `src/app/api/admin/mail/send/route.ts`, find:

```ts
import { resolveRecipients, defaultRecipientDeps, type RecipientParams } from '@/lib/mail-recipients';
```

Replace with:

```ts
import { resolveRecipients, type RecipientParams } from '@/lib/mail-recipients';
import { getActivitySources } from '@/lib/activity/registry';
```

Find:

```ts
    const target = body.target as RecipientParams;
    const recipients = await resolveRecipients(db, target, defaultRecipientDeps, {
      url: config.tautulli.url,
      apiKey: config.tautulli.apiKey,
    });
```

Replace with:

```ts
    const target = body.target as RecipientParams;
    const recipients = await resolveRecipients(db, target, getActivitySources(config));
```

- [ ] **Step 6: Run to verify, then the whole suite and typecheck**

```bash
npx vitest run tests/lib/mail-recipients.test.ts 2>&1 | tail -15
npm run typecheck 2>&1 | tail -20
npx vitest run 2>&1 | tail -15
SESSION_SECRET=verify-secret-0123456789abcdef0123456789 npm run build 2>&1 | tail -20
```

Expected: `mail-recipients.test.ts` passes; `npm run typecheck` is now fully clean (the last 2 of the 6 originally-identified errors, both in `admin/mail/send/route.ts`, are gone — this should be the very last of the Global Constraints' enumerated break list); whole suite green except the one documented pre-existing `dashboard-stats` failure; `next build` succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/lib/mail-recipients.ts src/app/api/admin/mail/send/route.ts tests/lib/mail-recipients.test.ts
git commit -m "feat: make mailing group targeting provider-aware (Tautulli was the only activity source before)" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Docs and final verification

**Files:**
- Modify: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: `.env.example`**

Find:

```
# PUBLIC_BASE_URL=https://portal.example.com
```

Add right after it:

```

# PUBLIC_COMMUNITY_NAME=The Crew
# Optional — shown in the newsletter subject and availability-notification emails.
# Falls back to PLEX_SERVER_NAME if that's set, then "Portarr". Mainly useful for a
# Jellyfin-only install, which has no PLEX_SERVER_NAME to fall back to.
```

- [ ] **Step 2: `README.md` — document `PUBLIC_COMMUNITY_NAME` and fix the stale shortcut count**

In the French configuration table, find:

```
| `PUBLIC_BASE_URL` | assistant ou env | Liens absolus dans les emails sortants + URL affichée dans le lien de configuration |
```

Add right after it:

```
| `PUBLIC_COMMUNITY_NAME` | assistant ou env (optionnel) | Nom affiché dans le sujet de la newsletter et les notifications de disponibilité — sinon le nom du serveur Plex, ou « Portarr » |
```

In the same French table, find (note: this row is already stale as of v1.6.1, which added Jellyfin/Jellystat shortcut slots but never updated this table row — fix it now):

```
| `SHORTCUT_<NOM>_URL` / `SHORTCUT_<NOM>_ICON_URL` (×6 : `PLEX`, `OVERSEERR`, `TAUTULLI`, `WIZARR`, `POSTERR`, `PLEX_REWIND`) | optionnel | Un raccourci dans la sidebar, un par paire définie. Les deux variables doivent être définies pour afficher une icône ; un raccourci avec seulement `_URL` s'affiche en lien texte seul. Totalement absent = ce raccourci n'apparaît pas. |
```

Replace with:

```
| `SHORTCUT_<NOM>_URL` / `SHORTCUT_<NOM>_ICON_URL` (×8 : `PLEX`, `OVERSEERR`, `TAUTULLI`, `JELLYFIN`, `JELLYSTAT`, `WIZARR`, `POSTERR`, `PLEX_REWIND`) | optionnel | Un raccourci dans la sidebar, un par paire définie. Les deux variables doivent être définies pour afficher une icône ; un raccourci avec seulement `_URL` s'affiche en lien texte seul. Totalement absent = ce raccourci n'apparaît pas. |
```

Do the same two edits in the English section: find

```
| `PUBLIC_BASE_URL` | wizard or env | Absolute links in outgoing emails + the URL shown in the setup link |
```

add right after it:

```
| `PUBLIC_COMMUNITY_NAME` | wizard or env (optional) | Name shown in the newsletter subject and availability-notification emails — otherwise the Plex server name, or "Portarr" |
```

and find:

```
| `SHORTCUT_<NAME>_URL` / `SHORTCUT_<NAME>_ICON_URL` (×6: `PLEX`, `OVERSEERR`, `TAUTULLI`, `WIZARR`, `POSTERR`, `PLEX_REWIND`) | optional | A sidebar shortcut link, one per pair set. Both vars must be set for an icon to show; a shortcut with only `_URL` renders as a text-only link. Absent entirely = that shortcut just isn't in the sidebar. |
```

replace with:

```
| `SHORTCUT_<NAME>_URL` / `SHORTCUT_<NAME>_ICON_URL` (×8: `PLEX`, `OVERSEERR`, `TAUTULLI`, `JELLYFIN`, `JELLYSTAT`, `WIZARR`, `POSTERR`, `PLEX_REWIND`) | optional | A sidebar shortcut link, one per pair set. Both vars must be set for an icon to show; a shortcut with only `_URL` renders as a text-only link. Absent entirely = that shortcut just isn't in the sidebar. |
```

- [ ] **Step 3: Full verification**

```bash
npm run typecheck 2>&1 | tail -10
npx vitest run 2>&1 | tail -15
SESSION_SECRET=verify-secret-0123456789abcdef0123456789 npm run build 2>&1 | tail -20
grep -rn "config\.plex\.\|config\.tautulli\." src --include="*.ts" --include="*.tsx" | grep -v "media/registry.ts\|src/lib/config.ts"
git diff main..HEAD | grep -inE "example-domain|172\.18|/home/media|example-user" | grep -v "jellystat\.local:3000\|jelly\.example-domain\.tech"
```

Expected: typecheck clean; whole suite green except the one documented pre-existing failure; `next build` succeeds; the `config.plex.`/`config.tautulli.` grep prints nothing (every non-null-assuming access outside the two files that are allowed to have it — `media/registry.ts`'s own null checks, and `config.ts`'s own `loadConfig` construction — is gone); the secrets/PII scan prints nothing (this is a public repo — same rule as every previous sub-project). Note: the second grep's exclusions are for hostnames that are intentionally public in this repo already (`jelly.example-domain.tech`/`jellystat.example-domain.tech` appear nowhere in this branch's diff in practice, this exclusion just future-proofs the check the same way sub-project 3a's did for its own test fixture host — if the grep does find a real match, stop and report it rather than assuming it's fine).

- [ ] **Step 4: Commit**

```bash
git add .env.example README.md
git commit -m "docs: document PUBLIC_COMMUNITY_NAME, fix stale sidebar-shortcut count in README" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Report (do not push)**

Report the commit list, test totals versus the baseline (only the pre-existing `dashboard-stats` failure remains), the `next build` result. Do not push and do not open a PR unless the user asks — this branch is not stacked on anything, so when they do, the PR targets `main` directly. No version bump, tag, or GitHub Release until the user explicitly approves, as with every previous release. No wiki update as part of this plan — that's a separate, controller-run step after the user decides to ship, matching how sub-project 3a's wiki update was handled.
