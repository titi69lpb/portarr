# Admin Config Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Portarr self-hoster start the container with (almost) no environment variables and configure Plex/Tautulli/Sonarr/Radarr/Overseerr/SMTP/public URL through a first-run setup wizard and a later owner-only settings page, instead of hand-editing `.env`.

**Architecture:** A new SQLite `settings` key-value table becomes a fallback source for the same env var names `config.ts` already required. `loadConfig()` resolves each in-scope field as `env[KEY] ?? db.get(KEY) ?? null`, so `better-sqlite3` being synchronous means no async refactor is needed at any of `loadConfig()`'s existing call sites. A single shared function, `applyServiceSettings`, validates + connection-tests + persists one service's fields at a time, reused by both the unauthenticated first-run wizard (`/setup`, gated by a token logged to stdout) and the owner-gated `/admin/settings` page (reusing the same form component).

**Tech Stack:** Next.js 14 App Router, better-sqlite3, vitest, existing `fetch-timeout.ts`/`mailer.ts`/`secure-compare.ts` helpers.

**Spec:** `docs/superpowers/specs/2026-09-16-admin-config-wizard-design.md`

## Global Constraints

- Env vars always win over DB-stored settings (backwards compatibility with every existing install — verbatim from spec's "Storage & precedence" section).
- Secrets (API keys, SMTP password, Plex server token) are stored in plaintext in the `settings` table — same trust boundary as the current `.env` file, no new encryption subsystem.
- `SESSION_SECRET`, `PLEX_CLIENT_IDENTIFIER`, `NEWSLETTER_CRON_SECRET`, `DOWNLOAD_SIGNING_SECRET` are auto-generated on first boot if absent from env, persisted, and never shown in any wizard/settings UI.
- `DATABASE_PATH` stays a pure env/infra concern, never a setting.
- Every "Tester" action must succeed before its fields are persisted — never silently save an untested/broken config.
- `Jellyfin` support is explicitly out of scope for this plan.

---

## File Structure

**New files:**
- `src/lib/settings.ts` — generic key-value get/set/delete over the new `settings` table.
- `src/lib/secrets.ts` — random secret generation + idempotent auto-secret persistence.
- `src/lib/settings-schema.ts` — the field list per configurable service (single source of truth for both UI rendering and env-key names).
- `src/lib/setup.ts` — first-run setup token lifecycle (generate/verify/invalidate).
- `src/lib/connection-test.ts` — one function per service that pings its real API and reports ok/error.
- `src/lib/setup-steps.ts` — `applyServiceSettings`, the shared validate+test+persist function used by both `/setup` and `/admin/settings`.
- `src/app/api/setup/step/route.ts` — unauthenticated (setup-token-gated) endpoint used by the wizard.
- `src/app/api/setup/complete/route.ts` — invalidates the setup token once every service is configured.
- `src/app/api/admin/settings/step/route.ts` — owner-gated equivalent of the setup-step endpoint, used after first-run.
- `src/components/ServiceSettingsForm.tsx` — shared form component (fields, masking, disabled-when-env-sourced).
- `src/components/SetupWizard.tsx` — client-side step orchestration for `/setup`.
- `src/components/AdminSettingsPanel.tsx` — renders one `ServiceSettingsForm` per service on `/admin/settings`.
- `src/app/setup/page.tsx` — server page: redirects away if setup is already complete, otherwise renders `SetupWizard`.
- `src/app/admin/settings/page.tsx` — owner-gated server page rendering `AdminSettingsPanel`.

**Modified files:**
- `src/lib/db.ts` — add the `settings` table to `SCHEMA`.
- `src/lib/config.ts` — nullable service configs, env>DB>null resolution, `isSetupComplete`, `assertConfigured`, `getConfigSources`.
- `src/middleware.ts` — redirect to `/setup` while setup is incomplete (except `/setup*`/`/api/setup/*` themselves).
- Every `loadConfig()` call site that `tsc --noEmit` flags after Task 4 (compiler-driven list, see Task 13).
- `src/app/admin/page.tsx` — add a "Réglages" nav card linking to `/admin/settings`.
- `.env.example` — note that these vars are now optional (wizard covers them).

---

### Task 1: `settings` table + `src/lib/settings.ts`

**Files:**
- Modify: `src/lib/db.ts`
- Create: `src/lib/settings.ts`
- Test: `tests/lib/settings.test.ts`

**Interfaces:**
- Produces: `getSetting(db, key: string): string | null`, `setSetting(db, key: string, value: string): void`, `deleteSetting(db, key: string): void`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/settings.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getDb, resetDbForTests } from '../../src/lib/db';
import { getSetting, setSetting, deleteSetting } from '../../src/lib/settings';

describe('settings', () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it('returns null for a key that was never set', () => {
    const db = getDb(':memory:');
    expect(getSetting(db, 'PLEX_URL')).toBeNull();
  });

  it('returns the value after setSetting', () => {
    const db = getDb(':memory:');
    setSetting(db, 'PLEX_URL', 'https://plex.example.com');
    expect(getSetting(db, 'PLEX_URL')).toBe('https://plex.example.com');
  });

  it('overwrites an existing value on a second setSetting for the same key', () => {
    const db = getDb(':memory:');
    setSetting(db, 'PLEX_URL', 'https://first.example.com');
    setSetting(db, 'PLEX_URL', 'https://second.example.com');
    expect(getSetting(db, 'PLEX_URL')).toBe('https://second.example.com');
  });

  it('deleteSetting removes the key, later gets return null', () => {
    const db = getDb(':memory:');
    setSetting(db, 'PLEX_URL', 'https://plex.example.com');
    deleteSetting(db, 'PLEX_URL');
    expect(getSetting(db, 'PLEX_URL')).toBeNull();
  });

  it('deleteSetting on a key that was never set does not throw', () => {
    const db = getDb(':memory:');
    expect(() => deleteSetting(db, 'NEVER_SET')).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/settings.test.ts`
Expected: FAIL — `Cannot find module '../../src/lib/settings'` (and `no such table: settings` once the module exists but before Step 3's schema change).

- [ ] **Step 3: Add the `settings` table to the schema**

In `src/lib/db.ts`, add this to the `SCHEMA` template string (anywhere among the other `CREATE TABLE IF NOT EXISTS` blocks — order doesn't matter, SQLite has no cross-table dependency here):

```sql
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

- [ ] **Step 4: Implement `src/lib/settings.ts`**

```typescript
import type Database from 'better-sqlite3';

export function getSetting(db: Database.Database, key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(db: Database.Database, key: string, value: string): void {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, value);
}

export function deleteSetting(db: Database.Database, key: string): void {
  db.prepare('DELETE FROM settings WHERE key = ?').run(key);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/lib/settings.test.ts`
Expected: PASS (5/5)

- [ ] **Step 6: Commit**

```bash
git add src/lib/db.ts src/lib/settings.ts tests/lib/settings.test.ts
git commit -m "feat: add settings key-value table and accessors"
```

---

### Task 2: `src/lib/secrets.ts`

**Files:**
- Create: `src/lib/secrets.ts`
- Test: `tests/lib/secrets.test.ts`

**Interfaces:**
- Consumes: `getSetting`, `setSetting` from `src/lib/settings.ts` (Task 1)
- Produces: `generateSecret(byteLength?: number): string`, `ensureAutoSecret(db, key: string, envValue: string | undefined, byteLength?: number): string`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/secrets.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getDb, resetDbForTests } from '../../src/lib/db';
import { getSetting } from '../../src/lib/settings';
import { generateSecret, ensureAutoSecret } from '../../src/lib/secrets';

describe('generateSecret', () => {
  it('returns a hex string of the requested byte length', () => {
    const secret = generateSecret(16);
    expect(secret).toMatch(/^[0-9a-f]{32}$/);
  });

  it('returns a different value on each call', () => {
    expect(generateSecret(16)).not.toBe(generateSecret(16));
  });
});

describe('ensureAutoSecret', () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it('returns the env value unchanged when one is provided, without touching the DB', () => {
    const db = getDb(':memory:');
    const result = ensureAutoSecret(db, 'SESSION_SECRET', 'env-provided-secret');
    expect(result).toBe('env-provided-secret');
    expect(getSetting(db, 'SESSION_SECRET')).toBeNull();
  });

  it('generates and persists a secret when env is undefined and none exists in DB', () => {
    const db = getDb(':memory:');
    const result = ensureAutoSecret(db, 'SESSION_SECRET', undefined);
    expect(result).toMatch(/^[0-9a-f]+$/);
    expect(getSetting(db, 'SESSION_SECRET')).toBe(result);
  });

  it('returns the same value on a second call — idempotent across restarts', () => {
    const db = getDb(':memory:');
    const first = ensureAutoSecret(db, 'SESSION_SECRET', undefined);
    const second = ensureAutoSecret(db, 'SESSION_SECRET', undefined);
    expect(second).toBe(first);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/secrets.test.ts`
Expected: FAIL — `Cannot find module '../../src/lib/secrets'`

- [ ] **Step 3: Implement `src/lib/secrets.ts`**

```typescript
import { randomBytes } from 'node:crypto';
import type Database from 'better-sqlite3';
import { getSetting, setSetting } from './settings';

export function generateSecret(byteLength: number = 32): string {
  return randomBytes(byteLength).toString('hex');
}

// Idempotent across restarts: env wins if set (never touches the DB in that
// case, so unsetting the env var later would fall through to a freshly
// generated secret, not a stale DB-cached one from a prior env-set run).
// Otherwise reuses whatever was already generated, or generates once and
// persists.
export function ensureAutoSecret(
  db: Database.Database,
  key: string,
  envValue: string | undefined,
  byteLength: number = 32
): string {
  if (envValue) return envValue;
  const existing = getSetting(db, key);
  if (existing) return existing;
  const generated = generateSecret(byteLength);
  setSetting(db, key, generated);
  return generated;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/secrets.test.ts`
Expected: PASS (5/5)

- [ ] **Step 5: Commit**

```bash
git add src/lib/secrets.ts tests/lib/secrets.test.ts
git commit -m "feat: add auto-generated secret helper"
```

---

### Task 3: `src/lib/settings-schema.ts`

**Files:**
- Create: `src/lib/settings-schema.ts`
- Test: `tests/lib/settings-schema.test.ts`

**Interfaces:**
- Produces: `type ServiceKey = 'publicBaseUrl' | 'plex' | 'tautulli' | 'sonarr' | 'radarr' | 'overseerr' | 'smtp'`, `interface FieldDef { envKey: string; label: string; type: 'text' | 'password' }`, `const SERVICE_FIELDS: Record<ServiceKey, FieldDef[]>`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/settings-schema.test.ts
import { describe, it, expect } from 'vitest';
import { SERVICE_FIELDS } from '../../src/lib/settings-schema';

describe('SERVICE_FIELDS', () => {
  it('covers exactly the 7 configurable groups', () => {
    expect(Object.keys(SERVICE_FIELDS).sort()).toEqual(
      ['overseerr', 'plex', 'publicBaseUrl', 'radarr', 'smtp', 'sonarr', 'tautulli'].sort()
    );
  });

  it('plex requires url, server token, and server name', () => {
    const keys = SERVICE_FIELDS.plex.map((f) => f.envKey);
    expect(keys).toEqual(['PLEX_URL', 'PLEX_SERVER_TOKEN', 'PLEX_SERVER_NAME']);
  });

  it('smtp requires all 6 mail fields', () => {
    const keys = SERVICE_FIELDS.smtp.map((f) => f.envKey);
    expect(keys).toEqual([
      'SMTP_HOST',
      'SMTP_PORT',
      'SMTP_USER',
      'SMTP_PASS',
      'MAIL_FROM_ADDRESS',
      'MAIL_FROM_NAME',
    ]);
  });

  it('publicBaseUrl has exactly one field', () => {
    expect(SERVICE_FIELDS.publicBaseUrl).toHaveLength(1);
    expect(SERVICE_FIELDS.publicBaseUrl[0].envKey).toBe('PUBLIC_BASE_URL');
  });

  it('marks API keys and passwords as type "password", URLs and names as "text"', () => {
    expect(SERVICE_FIELDS.plex.find((f) => f.envKey === 'PLEX_SERVER_TOKEN')?.type).toBe('password');
    expect(SERVICE_FIELDS.plex.find((f) => f.envKey === 'PLEX_URL')?.type).toBe('text');
    expect(SERVICE_FIELDS.smtp.find((f) => f.envKey === 'SMTP_PASS')?.type).toBe('password');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/settings-schema.test.ts`
Expected: FAIL — `Cannot find module '../../src/lib/settings-schema'`

- [ ] **Step 3: Implement `src/lib/settings-schema.ts`**

```typescript
export type ServiceKey =
  | 'publicBaseUrl'
  | 'plex'
  | 'tautulli'
  | 'sonarr'
  | 'radarr'
  | 'overseerr'
  | 'smtp';

export interface FieldDef {
  envKey: string;
  label: string;
  type: 'text' | 'password';
}

export const SERVICE_FIELDS: Record<ServiceKey, FieldDef[]> = {
  publicBaseUrl: [
    { envKey: 'PUBLIC_BASE_URL', label: 'URL publique de Portarr (ex. https://portarr.example.com)', type: 'text' },
  ],
  plex: [
    { envKey: 'PLEX_URL', label: 'URL du serveur Plex', type: 'text' },
    { envKey: 'PLEX_SERVER_TOKEN', label: 'Jeton serveur Plex', type: 'password' },
    { envKey: 'PLEX_SERVER_NAME', label: 'Nom du serveur (tel qu\'affiché sur plex.tv)', type: 'text' },
  ],
  tautulli: [
    { envKey: 'TAUTULLI_URL', label: 'URL Tautulli', type: 'text' },
    { envKey: 'TAUTULLI_API_KEY', label: 'Clé API Tautulli', type: 'password' },
  ],
  sonarr: [
    { envKey: 'SONARR_URL', label: 'URL Sonarr', type: 'text' },
    { envKey: 'SONARR_API_KEY', label: 'Clé API Sonarr', type: 'password' },
  ],
  radarr: [
    { envKey: 'RADARR_URL', label: 'URL Radarr', type: 'text' },
    { envKey: 'RADARR_API_KEY', label: 'Clé API Radarr', type: 'password' },
  ],
  overseerr: [
    { envKey: 'OVERSEERR_URL', label: 'URL Overseerr', type: 'text' },
    { envKey: 'OVERSEERR_API_KEY', label: 'Clé API Overseerr', type: 'password' },
  ],
  smtp: [
    { envKey: 'SMTP_HOST', label: 'Hôte SMTP', type: 'text' },
    { envKey: 'SMTP_PORT', label: 'Port SMTP', type: 'text' },
    { envKey: 'SMTP_USER', label: 'Utilisateur SMTP', type: 'text' },
    { envKey: 'SMTP_PASS', label: 'Mot de passe SMTP', type: 'password' },
    { envKey: 'MAIL_FROM_ADDRESS', label: 'Adresse d\'expédition', type: 'text' },
    { envKey: 'MAIL_FROM_NAME', label: 'Nom d\'expédition', type: 'text' },
  ],
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/settings-schema.test.ts`
Expected: PASS (5/5)

- [ ] **Step 5: Commit**

```bash
git add src/lib/settings-schema.ts tests/lib/settings-schema.test.ts
git commit -m "feat: add configurable service field schema"
```

---

### Task 4: Rewrite `src/lib/config.ts` — nullable services, env>DB precedence, `isSetupComplete`/`assertConfigured`/`getConfigSources`

This is the biggest task in the plan — it changes `loadConfig`'s signature and the shape of `AppConfig`. Read the whole task before starting.

**Files:**
- Modify: `src/lib/config.ts`
- Modify: `tests/lib/config.test.ts` (near-total rewrite — the fixture-building approach changes)

**Interfaces:**
- Consumes: `getSetting` (Task 1), `ensureAutoSecret` (Task 2)
- Produces:
  - `loadConfig(env?: NodeJS.ProcessEnv, db?: Database.Database): AppConfig` (now takes an optional second `db` param; existing zero-arg calls keep working)
  - `interface PlexConfig { url: string; serverToken: string; serverName: string; clientIdentifier: string }` (and equivalent `TautulliConfig`, `SonarrConfig`, `RadarrConfig`, `OverseerrConfig`, `SmtpConfig`)
  - `AppConfig.plex/tautulli/sonarr/radarr/overseerr/smtp: X | null`, `AppConfig.publicBaseUrl: string | null`
  - `isSetupComplete(config: AppConfig): boolean`
  - `interface ConfiguredAppConfig extends AppConfig { plex: PlexConfig; tautulli: TautulliConfig; sonarr: SonarrConfig; radarr: RadarrConfig; overseerr: OverseerrConfig; smtp: SmtpConfig; publicBaseUrl: string }`
  - `assertConfigured(config: AppConfig): ConfiguredAppConfig` (throws if `!isSetupComplete`)
  - `type ConfigSource = 'env' | 'db' | 'unset'`
  - `getConfigSources(env: NodeJS.ProcessEnv, db: Database.Database): Record<string, ConfigSource>`

- [ ] **Step 1: Write the failing tests**

Replace `tests/lib/config.test.ts` entirely with:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { getDb, resetDbForTests } from '../../src/lib/db';
import { setSetting } from '../../src/lib/settings';
import {
  loadConfig,
  isSetupComplete,
  assertConfigured,
  getConfigSources,
} from '../../src/lib/config';

const FULL_ENV = {
  NODE_ENV: 'test' as const,
  DATABASE_PATH: ':memory:',
  PUBLIC_BASE_URL: 'https://portal.example.com',
  PLEX_URL: 'https://plex.example.com',
  PLEX_SERVER_TOKEN: 'token',
  PLEX_SERVER_NAME: 'My Plex Server',
  TAUTULLI_URL: 'https://tautulli.example.com',
  TAUTULLI_API_KEY: 'tkey',
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

describe('loadConfig — fully configured via env (backwards compat)', () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it('returns non-null service configs for every in-scope field when env has them all', () => {
    const db = getDb(':memory:');
    const config = loadConfig(FULL_ENV, db);
    expect(config.plex).toEqual({
      url: 'https://plex.example.com',
      serverToken: 'token',
      serverName: 'My Plex Server',
      clientIdentifier: expect.any(String),
    });
    expect(config.tautulli).toEqual({ url: 'https://tautulli.example.com', apiKey: 'tkey' });
    expect(config.sonarr).toEqual({ url: 'https://sonarr.example.com', apiKey: 'skey' });
    expect(config.radarr).toEqual({ url: 'https://radarr.example.com', apiKey: 'rkey' });
    expect(config.overseerr).toEqual({ url: 'https://overseerr.example.com', apiKey: 'overseerr-key' });
    expect(config.smtp).toEqual({
      host: 'mail.example.com',
      port: '465',
      user: 'smtpuser',
      pass: 'smtppass',
      fromAddress: 'admin@example.com',
      fromName: 'Portarr',
    });
    expect(config.publicBaseUrl).toBe('https://portal.example.com');
  });

  it('isSetupComplete is true', () => {
    const db = getDb(':memory:');
    expect(isSetupComplete(loadConfig(FULL_ENV, db))).toBe(true);
  });

  it('assertConfigured does not throw and narrows every service to non-null', () => {
    const db = getDb(':memory:');
    const config = assertConfigured(loadConfig(FULL_ENV, db));
    expect(config.plex.url).toBe('https://plex.example.com');
  });

  it('auto-generates SESSION_SECRET/PLEX_CLIENT_IDENTIFIER/NEWSLETTER_CRON_SECRET/DOWNLOAD_SIGNING_SECRET when absent from env, and they are stable across two loadConfig calls', () => {
    const db = getDb(':memory:');
    const first = loadConfig(FULL_ENV, db);
    const second = loadConfig(FULL_ENV, db);
    expect(first.session.secret).toMatch(/^[0-9a-f]+$/);
    expect(first.session.secret).toBe(second.session.secret);
    expect(first.plex?.clientIdentifier).toBe(second.plex?.clientIdentifier);
    expect(first.newsletterCronSecret).toBe(second.newsletterCronSecret);
    expect(first.downloadSigningSecret).toBe(second.downloadSigningSecret);
  });
});

describe('loadConfig — nothing configured', () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it('every in-scope service is null, publicBaseUrl is null, isSetupComplete is false', () => {
    const db = getDb(':memory:');
    const config = loadConfig({ NODE_ENV: 'test' as const, DATABASE_PATH: ':memory:' }, db);
    expect(config.plex).toBeNull();
    expect(config.tautulli).toBeNull();
    expect(config.sonarr).toBeNull();
    expect(config.radarr).toBeNull();
    expect(config.overseerr).toBeNull();
    expect(config.smtp).toBeNull();
    expect(config.publicBaseUrl).toBeNull();
    expect(isSetupComplete(config)).toBe(false);
  });

  it('assertConfigured throws', () => {
    const db = getDb(':memory:');
    const config = loadConfig({ NODE_ENV: 'test' as const, DATABASE_PATH: ':memory:' }, db);
    expect(() => assertConfigured(config)).toThrow();
  });

  it('a partially-filled service (missing one required field) stays null', () => {
    const db = getDb(':memory:');
    const config = loadConfig(
      { NODE_ENV: 'test' as const, DATABASE_PATH: ':memory:', PLEX_URL: 'https://plex.example.com', PLEX_SERVER_TOKEN: 'token' },
      db
    );
    expect(config.plex).toBeNull();
  });
});

describe('loadConfig — DB-stored settings fill in for unset env vars', () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it('reads Plex config from the settings table when env is empty', () => {
    const db = getDb(':memory:');
    setSetting(db, 'PLEX_URL', 'https://plex.fromdb.example.com');
    setSetting(db, 'PLEX_SERVER_TOKEN', 'db-token');
    setSetting(db, 'PLEX_SERVER_NAME', 'DB Server');
    const config = loadConfig({ NODE_ENV: 'test' as const, DATABASE_PATH: ':memory:' }, db);
    expect(config.plex).toEqual({
      url: 'https://plex.fromdb.example.com',
      serverToken: 'db-token',
      serverName: 'DB Server',
      clientIdentifier: expect.any(String),
    });
  });

  it('env wins over a DB value for the same key', () => {
    const db = getDb(':memory:');
    setSetting(db, 'PLEX_URL', 'https://plex.fromdb.example.com');
    const config = loadConfig({ NODE_ENV: 'test' as const, DATABASE_PATH: ':memory:', PLEX_URL: 'https://plex.fromenv.example.com' }, db);
    expect(config.plex).toBeNull(); // env alone still leaves serverToken/serverName unset
  });
});

describe('getConfigSources', () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it('reports "env" for a key set via env, "db" for a key only in settings, "unset" for neither', () => {
    const db = getDb(':memory:');
    setSetting(db, 'TAUTULLI_URL', 'https://tautulli.fromdb.example.com');
    const sources = getConfigSources({ PLEX_URL: 'https://plex.example.com' }, db);
    expect(sources.PLEX_URL).toBe('env');
    expect(sources.TAUTULLI_URL).toBe('db');
    expect(sources.SONARR_URL).toBe('unset');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/config.test.ts`
Expected: FAIL — old `config.ts` shape doesn't match (missing exports, `AppConfig.plex` isn't nullable, `loadConfig` throws instead of returning nulls).

- [ ] **Step 3: Rewrite `src/lib/config.ts`**

```typescript
import type Database from 'better-sqlite3';
import { getDb } from './db';
import { getSetting } from './settings';
import { ensureAutoSecret } from './secrets';
import type { VolumeConfig } from './storage';

export interface ShortcutConfig {
  name: string;
  url: string;
  iconUrl: string | null;
}

const SHORTCUT_DEFS: { envKey: string; name: string }[] = [
  { envKey: 'PLEX', name: 'Plex' },
  { envKey: 'OVERSEERR', name: 'Overseerr' },
  { envKey: 'TAUTULLI', name: 'Tautulli' },
  { envKey: 'WIZARR', name: 'Wizarr' },
  { envKey: 'POSTERR', name: 'Posterr' },
  { envKey: 'PLEX_REWIND', name: 'Plex Rewind' },
];

function buildShortcuts(env: NodeJS.ProcessEnv): ShortcutConfig[] {
  const shortcuts: ShortcutConfig[] = [];
  for (const { envKey, name } of SHORTCUT_DEFS) {
    const url = env[`SHORTCUT_${envKey}_URL`];
    if (!url) continue;
    shortcuts.push({ name, url, iconUrl: env[`SHORTCUT_${envKey}_ICON_URL`] ?? null });
  }
  return shortcuts;
}

function parseStorageVolumes(env: NodeJS.ProcessEnv): VolumeConfig[] {
  const raw = env.STORAGE_VOLUMES;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is VolumeConfig => typeof v === 'object' && v !== null && typeof v.name === 'string' && typeof v.path === 'string'
    );
  } catch (err) {
    console.error('Failed to parse STORAGE_VOLUMES env var as JSON:', err);
    return [];
  }
}

// Single source of truth for the env>DB>null precedence rule — used by both
// loadConfig (to build the resolved config) and getConfigSources (to tell
// the settings UI which fields are env-sourced and must be disabled there).
export function resolveConfigValue(key: string, env: NodeJS.ProcessEnv, db: Database.Database): string | null {
  return env[key] || getSetting(db, key) || null;
}

export interface PlexConfig {
  url: string;
  serverToken: string;
  serverName: string;
  clientIdentifier: string;
}
export interface TautulliConfig {
  url: string;
  apiKey: string;
}
export interface SonarrConfig {
  url: string;
  apiKey: string;
}
export interface RadarrConfig {
  url: string;
  apiKey: string;
}
export interface OverseerrConfig {
  url: string;
  apiKey: string;
}
export interface SmtpConfig {
  host: string;
  port: string;
  user: string;
  pass: string;
  fromAddress: string;
  fromName: string;
}

export interface AppConfig {
  databasePath: string;
  session: { secret: string };
  plex: PlexConfig | null;
  tautulli: TautulliConfig | null;
  sonarr: SonarrConfig | null;
  radarr: RadarrConfig | null;
  overseerr: OverseerrConfig | null;
  smtp: SmtpConfig | null;
  newsletterCronSecret: string;
  publicBaseUrl: string | null;
  filesRootPath: string | null;
  downloadSigningSecret: string;
  downloadProxyUrl: string | null;
  fsTimeoutMs: number;
  kuma: { url: string; apiKey: string } | null;
  shortcuts: ShortcutConfig[];
  storageVolumes: VolumeConfig[];
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, db: Database.Database = getDb()): AppConfig {
  const v = (key: string) => resolveConfigValue(key, env, db);

  const plexUrl = v('PLEX_URL');
  const plexServerToken = v('PLEX_SERVER_TOKEN');
  const plexServerName = v('PLEX_SERVER_NAME');
  const plexClientIdentifier = ensureAutoSecret(db, 'PLEX_CLIENT_IDENTIFIER', env.PLEX_CLIENT_IDENTIFIER, 16);
  const plex: PlexConfig | null =
    plexUrl && plexServerToken && plexServerName
      ? { url: plexUrl, serverToken: plexServerToken, serverName: plexServerName, clientIdentifier: plexClientIdentifier }
      : null;

  const tautulliUrl = v('TAUTULLI_URL');
  const tautulliApiKey = v('TAUTULLI_API_KEY');
  const tautulli: TautulliConfig | null =
    tautulliUrl && tautulliApiKey ? { url: tautulliUrl, apiKey: tautulliApiKey } : null;

  const sonarrUrl = v('SONARR_URL');
  const sonarrApiKey = v('SONARR_API_KEY');
  const sonarr: SonarrConfig | null = sonarrUrl && sonarrApiKey ? { url: sonarrUrl, apiKey: sonarrApiKey } : null;

  const radarrUrl = v('RADARR_URL');
  const radarrApiKey = v('RADARR_API_KEY');
  const radarr: RadarrConfig | null = radarrUrl && radarrApiKey ? { url: radarrUrl, apiKey: radarrApiKey } : null;

  const overseerrUrl = v('OVERSEERR_URL');
  const overseerrApiKey = v('OVERSEERR_API_KEY');
  const overseerr: OverseerrConfig | null =
    overseerrUrl && overseerrApiKey ? { url: overseerrUrl, apiKey: overseerrApiKey } : null;

  const smtpHost = v('SMTP_HOST');
  const smtpPort = v('SMTP_PORT');
  const smtpUser = v('SMTP_USER');
  const smtpPass = v('SMTP_PASS');
  const mailFromAddress = v('MAIL_FROM_ADDRESS');
  const mailFromName = v('MAIL_FROM_NAME');
  const smtp: SmtpConfig | null =
    smtpHost && smtpPort && smtpUser && smtpPass && mailFromAddress && mailFromName
      ? { host: smtpHost, port: smtpPort, user: smtpUser, pass: smtpPass, fromAddress: mailFromAddress, fromName: mailFromName }
      : null;

  const publicBaseUrl = v('PUBLIC_BASE_URL');

  return {
    databasePath: env.DATABASE_PATH ?? './data/portal.db',
    session: { secret: ensureAutoSecret(db, 'SESSION_SECRET', env.SESSION_SECRET) },
    plex,
    tautulli,
    sonarr,
    radarr,
    overseerr,
    smtp,
    newsletterCronSecret: ensureAutoSecret(db, 'NEWSLETTER_CRON_SECRET', env.NEWSLETTER_CRON_SECRET),
    publicBaseUrl,
    filesRootPath: env.FILES_ROOT_PATH ?? null,
    downloadSigningSecret: ensureAutoSecret(db, 'DOWNLOAD_SIGNING_SECRET', env.DOWNLOAD_SIGNING_SECRET),
    downloadProxyUrl: env.DOWNLOAD_PROXY_URL ?? null,
    fsTimeoutMs: Number(env.FS_TIMEOUT_MS ?? '5000'),
    kuma: env.KUMA_URL && env.KUMA_API_KEY ? { url: env.KUMA_URL, apiKey: env.KUMA_API_KEY } : null,
    shortcuts: buildShortcuts(env),
    storageVolumes: parseStorageVolumes(env),
  };
}

export function isSetupComplete(config: AppConfig): boolean {
  return (
    config.plex !== null &&
    config.tautulli !== null &&
    config.sonarr !== null &&
    config.radarr !== null &&
    config.overseerr !== null &&
    config.smtp !== null &&
    config.publicBaseUrl !== null
  );
}

export interface ConfiguredAppConfig extends AppConfig {
  plex: PlexConfig;
  tautulli: TautulliConfig;
  sonarr: SonarrConfig;
  radarr: RadarrConfig;
  overseerr: OverseerrConfig;
  smtp: SmtpConfig;
  publicBaseUrl: string;
}

// Called once per request, right after loadConfig(), by every route/page
// that isn't part of the setup flow itself — the middleware setup-gate
// (Task 12) guarantees isSetupComplete() is already true by the time any of
// those call sites run, so this narrows the type instead of re-deriving
// the check. Throwing here means a bug in the middleware gate fails loudly
// instead of silently reading undefined fields.
export function assertConfigured(config: AppConfig): ConfiguredAppConfig {
  if (!isSetupComplete(config)) {
    throw new Error('assertConfigured called before setup was complete — this should be unreachable past the setup middleware gate');
  }
  return config as ConfiguredAppConfig;
}

export type ConfigSource = 'env' | 'db' | 'unset';

const CONFIGURABLE_KEYS = [
  'PUBLIC_BASE_URL',
  'PLEX_URL',
  'PLEX_SERVER_TOKEN',
  'PLEX_SERVER_NAME',
  'TAUTULLI_URL',
  'TAUTULLI_API_KEY',
  'SONARR_URL',
  'SONARR_API_KEY',
  'RADARR_URL',
  'RADARR_API_KEY',
  'OVERSEERR_URL',
  'OVERSEERR_API_KEY',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'MAIL_FROM_ADDRESS',
  'MAIL_FROM_NAME',
] as const;

export function getConfigSources(env: NodeJS.ProcessEnv, db: Database.Database): Record<string, ConfigSource> {
  const sources: Record<string, ConfigSource> = {};
  for (const key of CONFIGURABLE_KEYS) {
    if (env[key]) {
      sources[key] = 'env';
    } else if (getSetting(db, key)) {
      sources[key] = 'db';
    } else {
      sources[key] = 'unset';
    }
  }
  return sources;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/config.test.ts`
Expected: PASS (all cases)

- [ ] **Step 5: Commit**

```bash
git add src/lib/config.ts tests/lib/config.test.ts
git commit -m "feat: resolve config from env with DB fallback, drop startup throw"
```

---

### Task 5: `src/lib/setup.ts` — setup token lifecycle

**Files:**
- Create: `src/lib/setup.ts`
- Test: `tests/lib/setup.test.ts`

**Interfaces:**
- Consumes: `getSetting`/`setSetting`/`deleteSetting` (Task 1), `generateSecret` (Task 2), `secureCompare` (existing `src/lib/secure-compare.ts`)
- Produces: `getOrCreateSetupToken(db): string`, `verifySetupToken(db, token: string): boolean`, `invalidateSetupToken(db): void`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/setup.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getDb, resetDbForTests } from '../../src/lib/db';
import { getOrCreateSetupToken, verifySetupToken, invalidateSetupToken } from '../../src/lib/setup';

describe('setup token lifecycle', () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it('generates a token on first call', () => {
    const db = getDb(':memory:');
    const token = getOrCreateSetupToken(db);
    expect(token).toMatch(/^[0-9a-f]+$/);
  });

  it('returns the same token on a second call', () => {
    const db = getDb(':memory:');
    const first = getOrCreateSetupToken(db);
    const second = getOrCreateSetupToken(db);
    expect(second).toBe(first);
  });

  it('verifySetupToken is true for the current token', () => {
    const db = getDb(':memory:');
    const token = getOrCreateSetupToken(db);
    expect(verifySetupToken(db, token)).toBe(true);
  });

  it('verifySetupToken is false for a wrong token', () => {
    const db = getDb(':memory:');
    getOrCreateSetupToken(db);
    expect(verifySetupToken(db, 'wrong-token')).toBe(false);
  });

  it('verifySetupToken is false when no token has ever been generated', () => {
    const db = getDb(':memory:');
    expect(verifySetupToken(db, 'anything')).toBe(false);
  });

  it('invalidateSetupToken makes any subsequent verify fail', () => {
    const db = getDb(':memory:');
    const token = getOrCreateSetupToken(db);
    invalidateSetupToken(db);
    expect(verifySetupToken(db, token)).toBe(false);
  });

  it('getOrCreateSetupToken after invalidation generates a fresh, different token', () => {
    const db = getDb(':memory:');
    const first = getOrCreateSetupToken(db);
    invalidateSetupToken(db);
    const second = getOrCreateSetupToken(db);
    expect(second).not.toBe(first);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/setup.test.ts`
Expected: FAIL — `Cannot find module '../../src/lib/setup'`

- [ ] **Step 3: Implement `src/lib/setup.ts`**

```typescript
import type Database from 'better-sqlite3';
import { getSetting, setSetting, deleteSetting } from './settings';
import { generateSecret } from './secrets';
import { secureCompare } from './secure-compare';

const SETUP_TOKEN_KEY = 'SETUP_TOKEN';

export function getOrCreateSetupToken(db: Database.Database): string {
  const existing = getSetting(db, SETUP_TOKEN_KEY);
  if (existing) return existing;
  const token = generateSecret(16);
  setSetting(db, SETUP_TOKEN_KEY, token);
  return token;
}

export function verifySetupToken(db: Database.Database, token: string): boolean {
  const stored = getSetting(db, SETUP_TOKEN_KEY);
  return stored !== null && secureCompare(stored, token);
}

export function invalidateSetupToken(db: Database.Database): void {
  deleteSetting(db, SETUP_TOKEN_KEY);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/setup.test.ts`
Expected: PASS (7/7)

- [ ] **Step 5: Commit**

```bash
git add src/lib/setup.ts tests/lib/setup.test.ts
git commit -m "feat: add first-run setup token lifecycle"
```

---

### Task 6: `src/lib/connection-test.ts` — Plex + Tautulli

**Files:**
- Create: `src/lib/connection-test.ts`
- Test: `tests/lib/connection-test.test.ts`

**Interfaces:**
- Consumes: `timeoutSignal` (existing `src/lib/fetch-timeout.ts`)
- Produces: `interface ConnectionTestResult { ok: boolean; error: string | null }`, `testPlexConnection(url, serverToken, fetchFn?): Promise<ConnectionTestResult>`, `testTautulliConnection(url, apiKey, fetchFn?): Promise<ConnectionTestResult>`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/connection-test.test.ts
import { describe, it, expect, vi } from 'vitest';
import { testPlexConnection, testTautulliConnection } from '../../src/lib/connection-test';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: async () => body,
  } as Response;
}

describe('testPlexConnection', () => {
  it('succeeds when /identity returns a machineIdentifier', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ MediaContainer: { machineIdentifier: 'abc123' } }));
    const result = await testPlexConnection('https://plex.example.com', 'server-token', fetchMock);
    expect(result).toEqual({ ok: true, error: null });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://plex.example.com/identity?X-Plex-Token=server-token',
      expect.objectContaining({ headers: { Accept: 'application/json' } })
    );
  });

  it('fails with the status code when Plex responds non-ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, false, 401));
    const result = await testPlexConnection('https://plex.example.com', 'bad-token', fetchMock);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('401');
  });

  it('fails when the response has no machineIdentifier', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ MediaContainer: {} }));
    const result = await testPlexConnection('https://plex.example.com', 'token', fetchMock);
    expect(result.ok).toBe(false);
  });

  it('fails with the network error message when fetch throws', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await testPlexConnection('https://plex.example.com', 'token', fetchMock);
    expect(result).toEqual({ ok: false, error: 'ECONNREFUSED' });
  });
});

describe('testTautulliConnection', () => {
  it('succeeds when Tautulli returns result: success', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ response: { result: 'success' } }));
    const result = await testTautulliConnection('https://tautulli.example.com', 'tkey', fetchMock);
    expect(result).toEqual({ ok: true, error: null });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://tautulli.example.com/api/v2?apikey=tkey&cmd=get_server_info',
      expect.anything()
    );
  });

  it('fails with the Tautulli message when result is not success', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ response: { result: 'error', message: 'Invalid apikey' } }));
    const result = await testTautulliConnection('https://tautulli.example.com', 'bad-key', fetchMock);
    expect(result).toEqual({ ok: false, error: 'Invalid apikey' });
  });

  it('fails with the status code when the HTTP call itself is non-ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, false, 500));
    const result = await testTautulliConnection('https://tautulli.example.com', 'tkey', fetchMock);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('500');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/connection-test.test.ts`
Expected: FAIL — `Cannot find module '../../src/lib/connection-test'`

- [ ] **Step 3: Implement `src/lib/connection-test.ts`** (Plex + Tautulli only for this task — Sonarr/Radarr/Overseerr/SMTP are appended in Tasks 7-9)

```typescript
import { timeoutSignal } from './fetch-timeout';

export interface ConnectionTestResult {
  ok: boolean;
  error: string | null;
}

function messageFromError(err: unknown): string {
  return err instanceof Error ? err.message : 'Erreur réseau inconnue';
}

export async function testPlexConnection(
  url: string,
  serverToken: string,
  fetchFn: typeof fetch = fetch
): Promise<ConnectionTestResult> {
  try {
    const res = await fetchFn(`${url}/identity?X-Plex-Token=${serverToken}`, {
      headers: { Accept: 'application/json' },
      signal: timeoutSignal(),
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false, error: `Plex a répondu ${res.status} ${res.statusText}` };
    const data = (await res.json()) as { MediaContainer?: { machineIdentifier?: string } };
    if (!data.MediaContainer?.machineIdentifier) {
      return { ok: false, error: 'Réponse Plex inattendue (pas de machineIdentifier)' };
    }
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: messageFromError(err) };
  }
}

export async function testTautulliConnection(
  url: string,
  apiKey: string,
  fetchFn: typeof fetch = fetch
): Promise<ConnectionTestResult> {
  try {
    const res = await fetchFn(`${url}/api/v2?apikey=${apiKey}&cmd=get_server_info`, {
      signal: timeoutSignal(),
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false, error: `Tautulli a répondu ${res.status} ${res.statusText}` };
    const data = (await res.json()) as { response?: { result?: string; message?: string } };
    if (data.response?.result !== 'success') {
      return { ok: false, error: data.response?.message ?? 'Réponse Tautulli inattendue' };
    }
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: messageFromError(err) };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/connection-test.test.ts`
Expected: PASS (7/7)

- [ ] **Step 5: Commit**

```bash
git add src/lib/connection-test.ts tests/lib/connection-test.test.ts
git commit -m "feat: add Plex and Tautulli connection tests"
```

---

### Task 7: `src/lib/connection-test.ts` — Sonarr + Radarr

**Files:**
- Modify: `src/lib/connection-test.ts`
- Modify: `tests/lib/connection-test.test.ts`

**Interfaces:**
- Produces: `testSonarrConnection(url, apiKey, fetchFn?): Promise<ConnectionTestResult>`, `testRadarrConnection(url, apiKey, fetchFn?): Promise<ConnectionTestResult>`

- [ ] **Step 1: Add the failing tests** (append to `tests/lib/connection-test.test.ts`)

```typescript
import { testSonarrConnection, testRadarrConnection } from '../../src/lib/connection-test';

describe('testSonarrConnection', () => {
  it('succeeds on a 200 from /api/v3/system/status with the api key header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    const result = await testSonarrConnection('https://sonarr.example.com', 'skey', fetchMock);
    expect(result).toEqual({ ok: true, error: null });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://sonarr.example.com/api/v3/system/status',
      expect.objectContaining({ headers: { 'X-Api-Key': 'skey' } })
    );
  });

  it('fails with the status code on a non-ok response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, false, 401));
    const result = await testSonarrConnection('https://sonarr.example.com', 'bad-key', fetchMock);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('401');
  });
});

describe('testRadarrConnection', () => {
  it('succeeds on a 200 from /api/v3/system/status with the api key header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    const result = await testRadarrConnection('https://radarr.example.com', 'rkey', fetchMock);
    expect(result).toEqual({ ok: true, error: null });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://radarr.example.com/api/v3/system/status',
      expect.objectContaining({ headers: { 'X-Api-Key': 'rkey' } })
    );
  });

  it('fails with the network error message when fetch throws', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('ETIMEDOUT'));
    const result = await testRadarrConnection('https://radarr.example.com', 'rkey', fetchMock);
    expect(result).toEqual({ ok: false, error: 'ETIMEDOUT' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/connection-test.test.ts`
Expected: FAIL — `testSonarrConnection`/`testRadarrConnection` not exported

- [ ] **Step 3: Append to `src/lib/connection-test.ts`**

```typescript
async function testArrConnection(
  serviceName: string,
  url: string,
  apiKey: string,
  fetchFn: typeof fetch
): Promise<ConnectionTestResult> {
  try {
    const res = await fetchFn(`${url}/api/v3/system/status`, {
      headers: { 'X-Api-Key': apiKey },
      signal: timeoutSignal(),
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false, error: `${serviceName} a répondu ${res.status} ${res.statusText}` };
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: messageFromError(err) };
  }
}

export async function testSonarrConnection(
  url: string,
  apiKey: string,
  fetchFn: typeof fetch = fetch
): Promise<ConnectionTestResult> {
  return testArrConnection('Sonarr', url, apiKey, fetchFn);
}

export async function testRadarrConnection(
  url: string,
  apiKey: string,
  fetchFn: typeof fetch = fetch
): Promise<ConnectionTestResult> {
  return testArrConnection('Radarr', url, apiKey, fetchFn);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/connection-test.test.ts`
Expected: PASS (11/11)

- [ ] **Step 5: Commit**

```bash
git add src/lib/connection-test.ts tests/lib/connection-test.test.ts
git commit -m "feat: add Sonarr and Radarr connection tests"
```

---

### Task 8: `src/lib/connection-test.ts` — Overseerr

**Files:**
- Modify: `src/lib/connection-test.ts`
- Modify: `tests/lib/connection-test.test.ts`

**Interfaces:**
- Produces: `testOverseerrConnection(url, apiKey, fetchFn?): Promise<ConnectionTestResult>`

- [ ] **Step 1: Add the failing tests** (append to `tests/lib/connection-test.test.ts`)

```typescript
import { testOverseerrConnection } from '../../src/lib/connection-test';

describe('testOverseerrConnection', () => {
  it('succeeds on a 200 from /api/v1/status with the api key header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    const result = await testOverseerrConnection('https://overseerr.example.com', 'okey', fetchMock);
    expect(result).toEqual({ ok: true, error: null });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://overseerr.example.com/api/v1/status',
      expect.objectContaining({ headers: { 'X-Api-Key': 'okey' } })
    );
  });

  it('fails with the status code on a non-ok response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, false, 403));
    const result = await testOverseerrConnection('https://overseerr.example.com', 'bad-key', fetchMock);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('403');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/connection-test.test.ts`
Expected: FAIL — `testOverseerrConnection` not exported

- [ ] **Step 3: Append to `src/lib/connection-test.ts`**

```typescript
export async function testOverseerrConnection(
  url: string,
  apiKey: string,
  fetchFn: typeof fetch = fetch
): Promise<ConnectionTestResult> {
  try {
    const res = await fetchFn(`${url}/api/v1/status`, {
      headers: { 'X-Api-Key': apiKey },
      signal: timeoutSignal(),
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false, error: `Overseerr a répondu ${res.status} ${res.statusText}` };
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: messageFromError(err) };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/connection-test.test.ts`
Expected: PASS (13/13)

- [ ] **Step 5: Commit**

```bash
git add src/lib/connection-test.ts tests/lib/connection-test.test.ts
git commit -m "feat: add Overseerr connection test"
```

---

### Task 9: `src/lib/connection-test.ts` — SMTP

**Files:**
- Modify: `src/lib/connection-test.ts`
- Modify: `tests/lib/connection-test.test.ts`

**Interfaces:**
- Consumes: `createTransport` (existing `src/lib/mailer.ts`)
- Produces: `testSmtpConnection(config: { host, port, user, pass, fromAddress, fromName }, createTransportFn?): Promise<ConnectionTestResult>`

- [ ] **Step 1: Add the failing tests** (append to `tests/lib/connection-test.test.ts`)

```typescript
import { testSmtpConnection } from '../../src/lib/connection-test';
import type { MailTransport } from '../../src/lib/mailer';

describe('testSmtpConnection', () => {
  const SMTP_CONFIG = {
    host: 'mail.example.com',
    port: '465',
    user: 'smtpuser',
    pass: 'smtppass',
    fromAddress: 'admin@example.com',
    fromName: 'Portarr',
  };

  it('succeeds and sends a test email to the from-address', async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: 'abc' });
    const fakeTransport: MailTransport = { sendMail };
    const createTransportFn = vi.fn().mockReturnValue(fakeTransport);

    const result = await testSmtpConnection(SMTP_CONFIG, createTransportFn);

    expect(result).toEqual({ ok: true, error: null });
    expect(createTransportFn).toHaveBeenCalledWith({
      host: 'mail.example.com',
      port: '465',
      user: 'smtpuser',
      pass: 'smtppass',
    });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'admin@example.com', from: 'Portarr <admin@example.com>' })
    );
  });

  it('fails with the SMTP error message when sendMail rejects', async () => {
    const sendMail = vi.fn().mockRejectedValue(new Error('535 Authentication failed'));
    const createTransportFn = vi.fn().mockReturnValue({ sendMail } as MailTransport);

    const result = await testSmtpConnection(SMTP_CONFIG, createTransportFn);

    expect(result).toEqual({ ok: false, error: '535 Authentication failed' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/connection-test.test.ts`
Expected: FAIL — `testSmtpConnection` not exported

- [ ] **Step 3: Append to `src/lib/connection-test.ts`**

```typescript
import { createTransport } from './mailer';

export async function testSmtpConnection(
  config: { host: string; port: string; user: string; pass: string; fromAddress: string; fromName: string },
  createTransportFn: typeof createTransport = createTransport
): Promise<ConnectionTestResult> {
  try {
    const transport = createTransportFn({ host: config.host, port: config.port, user: config.user, pass: config.pass });
    await transport.sendMail({
      from: `${config.fromName} <${config.fromAddress}>`,
      to: config.fromAddress,
      subject: 'Portarr — test de configuration SMTP',
      html: '<p>Ce message confirme que la configuration SMTP de Portarr fonctionne.</p>',
    });
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: messageFromError(err) };
  }
}
```

(Add the `import { createTransport } from './mailer';` line near the top of the file alongside the existing `timeoutSignal` import.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/connection-test.test.ts`
Expected: PASS (15/15)

- [ ] **Step 5: Commit**

```bash
git add src/lib/connection-test.ts tests/lib/connection-test.test.ts
git commit -m "feat: add SMTP connection test"
```

---

### Task 10: `src/lib/setup-steps.ts` — `applyServiceSettings`

**Files:**
- Create: `src/lib/setup-steps.ts`
- Test: `tests/lib/setup-steps.test.ts`

**Interfaces:**
- Consumes: `SERVICE_FIELDS`, `type ServiceKey` (Task 3), `getSetting`/`setSetting` (Task 1), all `test*Connection` functions (Tasks 6-9)
- Produces: `interface StepResult { ok: boolean; error: string | null }`, `applyServiceSettings(db, service: ServiceKey, values: Record<string,string>, env?, fetchFn?): Promise<StepResult>`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/setup-steps.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDb, resetDbForTests } from '../../src/lib/db';
import { getSetting } from '../../src/lib/settings';
import { applyServiceSettings } from '../../src/lib/setup-steps';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, statusText: ok ? 'OK' : 'Error', json: async () => body } as Response;
}

describe('applyServiceSettings', () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it('rejects when a required field is missing', async () => {
    const db = getDb(':memory:');
    const result = await applyServiceSettings(db, 'plex', { PLEX_URL: 'https://plex.example.com' }, {}, vi.fn());
    expect(result.ok).toBe(false);
    expect(getSetting(db, 'PLEX_URL')).toBeNull();
  });

  it('runs the connection test and rejects without persisting when it fails', async () => {
    const db = getDb(':memory:');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, false, 401));
    const result = await applyServiceSettings(
      db,
      'plex',
      { PLEX_URL: 'https://plex.example.com', PLEX_SERVER_TOKEN: 'bad', PLEX_SERVER_NAME: 'Srv' },
      {},
      fetchMock
    );
    expect(result.ok).toBe(false);
    expect(getSetting(db, 'PLEX_URL')).toBeNull();
  });

  it('persists every field on a successful test', async () => {
    const db = getDb(':memory:');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ MediaContainer: { machineIdentifier: 'id' } }));
    const result = await applyServiceSettings(
      db,
      'plex',
      { PLEX_URL: 'https://plex.example.com', PLEX_SERVER_TOKEN: 'good', PLEX_SERVER_NAME: 'Srv' },
      {},
      fetchMock
    );
    expect(result).toEqual({ ok: true, error: null });
    expect(getSetting(db, 'PLEX_URL')).toBe('https://plex.example.com');
    expect(getSetting(db, 'PLEX_SERVER_TOKEN')).toBe('good');
    expect(getSetting(db, 'PLEX_SERVER_NAME')).toBe('Srv');
  });

  it('publicBaseUrl skips the connection test entirely', async () => {
    const db = getDb(':memory:');
    const fetchMock = vi.fn();
    const result = await applyServiceSettings(db, 'publicBaseUrl', { PUBLIC_BASE_URL: 'https://portarr.example.com' }, {}, fetchMock);
    expect(result).toEqual({ ok: true, error: null });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getSetting(db, 'PUBLIC_BASE_URL')).toBe('https://portarr.example.com');
  });

  it('a blank submitted field falls back to the existing DB value instead of rejecting — partial re-edit support', async () => {
    const db = getDb(':memory:');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ MediaContainer: { machineIdentifier: 'id' } }));
    await applyServiceSettings(
      db,
      'plex',
      { PLEX_URL: 'https://plex.example.com', PLEX_SERVER_TOKEN: 'good', PLEX_SERVER_NAME: 'Srv' },
      {},
      fetchMock
    );

    const result = await applyServiceSettings(
      db,
      'plex',
      { PLEX_URL: 'https://plex-updated.example.com', PLEX_SERVER_TOKEN: '', PLEX_SERVER_NAME: '' },
      {},
      fetchMock
    );

    expect(result).toEqual({ ok: true, error: null });
    expect(getSetting(db, 'PLEX_URL')).toBe('https://plex-updated.example.com');
    expect(getSetting(db, 'PLEX_SERVER_TOKEN')).toBe('good');
    expect(getSetting(db, 'PLEX_SERVER_NAME')).toBe('Srv');
  });

  it('never overwrites a field that is currently sourced from env, even if submitted', async () => {
    const db = getDb(':memory:');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ MediaContainer: { machineIdentifier: 'id' } }));
    const result = await applyServiceSettings(
      db,
      'plex',
      { PLEX_URL: 'https://attempted-override.example.com', PLEX_SERVER_TOKEN: 'good', PLEX_SERVER_NAME: 'Srv' },
      { PLEX_URL: 'https://from-env.example.com' },
      fetchMock
    );
    expect(result.ok).toBe(true);
    expect(getSetting(db, 'PLEX_URL')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/setup-steps.test.ts`
Expected: FAIL — `Cannot find module '../../src/lib/setup-steps'`

- [ ] **Step 3: Implement `src/lib/setup-steps.ts`**

```typescript
import type Database from 'better-sqlite3';
import { getSetting, setSetting } from './settings';
import { SERVICE_FIELDS, type ServiceKey } from './settings-schema';
import {
  testPlexConnection,
  testTautulliConnection,
  testSonarrConnection,
  testRadarrConnection,
  testOverseerrConnection,
  testSmtpConnection,
} from './connection-test';

export interface StepResult {
  ok: boolean;
  error: string | null;
}

async function runConnectionTest(
  service: ServiceKey,
  resolved: Record<string, string>,
  fetchFn: typeof fetch
): Promise<StepResult> {
  switch (service) {
    case 'publicBaseUrl':
      return { ok: true, error: null };
    case 'plex':
      return testPlexConnection(resolved.PLEX_URL, resolved.PLEX_SERVER_TOKEN, fetchFn);
    case 'tautulli':
      return testTautulliConnection(resolved.TAUTULLI_URL, resolved.TAUTULLI_API_KEY, fetchFn);
    case 'sonarr':
      return testSonarrConnection(resolved.SONARR_URL, resolved.SONARR_API_KEY, fetchFn);
    case 'radarr':
      return testRadarrConnection(resolved.RADARR_URL, resolved.RADARR_API_KEY, fetchFn);
    case 'overseerr':
      return testOverseerrConnection(resolved.OVERSEERR_URL, resolved.OVERSEERR_API_KEY, fetchFn);
    case 'smtp':
      return testSmtpConnection({
        host: resolved.SMTP_HOST,
        port: resolved.SMTP_PORT,
        user: resolved.SMTP_USER,
        pass: resolved.SMTP_PASS,
        fromAddress: resolved.MAIL_FROM_ADDRESS,
        fromName: resolved.MAIL_FROM_NAME,
      });
  }
}

// Shared by both /api/setup/step (first-run wizard) and /api/admin/settings/step
// (post-setup editing). A blank submitted value falls back to whatever's
// already resolved (env or DB) for that key rather than rejecting — this is
// what lets the admin/settings UI change just one field of a multi-field
// service without re-typing every secret. Never writes a key that's
// currently env-sourced, even if a value was submitted for it (defense in
// depth — the UI already disables those fields, but env still wins in
// loadConfig either way, so writing there would be a silent no-op at best).
export async function applyServiceSettings(
  db: Database.Database,
  service: ServiceKey,
  values: Record<string, string>,
  env: NodeJS.ProcessEnv = process.env,
  fetchFn: typeof fetch = fetch
): Promise<StepResult> {
  const fields = SERVICE_FIELDS[service];
  const resolved: Record<string, string> = {};

  for (const field of fields) {
    const submitted = values[field.envKey]?.trim();
    if (submitted) {
      resolved[field.envKey] = submitted;
      continue;
    }
    const existing = env[field.envKey] || getSetting(db, field.envKey);
    if (!existing) {
      return { ok: false, error: `${field.label} est requis` };
    }
    resolved[field.envKey] = existing;
  }

  const testResult = await runConnectionTest(service, resolved, fetchFn);
  if (!testResult.ok) return testResult;

  for (const field of fields) {
    if (env[field.envKey]) continue;
    setSetting(db, field.envKey, resolved[field.envKey]);
  }
  return { ok: true, error: null };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/setup-steps.test.ts`
Expected: PASS (6/6)

- [ ] **Step 5: Commit**

```bash
git add src/lib/setup-steps.ts tests/lib/setup-steps.test.ts
git commit -m "feat: add shared validate+test+persist function for service settings"
```

---

### Task 11: Middleware setup gate

**Files:**
- Modify: `src/middleware.ts`
- Modify: `tests/middleware.test.ts`

**Interfaces:**
- Consumes: `isSetupComplete`, `assertConfigured` (Task 4)
- Produces: `isSetupPath(pathname: string): boolean` (exported, mirrors the existing `isPublicPath`)

- [ ] **Step 1: Add the failing tests** (append to `tests/middleware.test.ts`)

```typescript
import { isSetupPath } from '../src/middleware';

describe('isSetupPath', () => {
  it('matches /setup itself', () => {
    expect(isSetupPath('/setup')).toBe(true);
  });

  it('matches setup API routes', () => {
    expect(isSetupPath('/api/setup/step')).toBe(true);
    expect(isSetupPath('/api/setup/complete')).toBe(true);
  });

  it('does not match unrelated paths', () => {
    expect(isSetupPath('/')).toBe(false);
    expect(isSetupPath('/admin/settings')).toBe(false);
    expect(isSetupPath('/api/setupsomethingelse')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/middleware.test.ts`
Expected: FAIL — `isSetupPath` not exported from `../src/middleware`

- [ ] **Step 3: Modify `src/middleware.ts`**

Add near the top, alongside the existing `PUBLIC_PATHS`/`PUBLIC_PREFIXES`/`isPublicPath`:

```typescript
import { loadConfig, isSetupComplete, assertConfigured } from '@/lib/config';
import { getDb } from '@/lib/db';

export function isSetupPath(pathname: string): boolean {
  return pathname === '/setup' || pathname.startsWith('/setup/') || pathname.startsWith('/api/setup/');
}
```

Then, inside the `middleware` function, right after `const pathname = request.nextUrl.pathname;` and before the existing `if (isPublicPath(pathname))` check, insert the setup gate:

```typescript
  const config = loadConfig(process.env, getDb());

  if (isSetupPath(pathname)) {
    // Once setup is done, /setup falls through to ordinary session-based
    // access control below (its own page component then redirects an
    // authenticated owner to /admin/settings — see Task 17).
    if (!isSetupComplete(config)) {
      return NextResponse.next();
    }
  } else if (!isSetupComplete(config)) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'setup_incomplete' }, { status: 503 });
    }
    return NextResponse.redirect(new URL('/setup', request.url));
  }
```

The rest of the function is unchanged **except**: the existing block

```typescript
  const config = loadConfig();
  let sessionUser = token ? await verifySession(token, config.session.secret) : null;
```

loses its own `const config = loadConfig();` line (config is now computed once, above, before the setup gate) — keep the `verifySession` line as-is, it still reads `config.session.secret` which is unaffected by the nullable-services change.

Further down, the existing revalidation block:

```typescript
  if (sessionUser && !sessionUser.isOwner) {
    const stillShared = await isStillSharedUser(
      sessionUser.plexId,
      config.plex.serverToken,
      config.plex.serverName
    );
```

now fails to compile because `config.plex` is `PlexConfig | null`. By this point in the function, `isSetupComplete(config)` is guaranteed true (the setup gate above already returned otherwise), so narrow it explicitly:

```typescript
  if (sessionUser && !sessionUser.isOwner) {
    const configured = assertConfigured(config);
    const stillShared = await isStillSharedUser(
      sessionUser.plexId,
      configured.plex.serverToken,
      configured.plex.serverName
    );
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/middleware.test.ts`
Expected: PASS (all cases, including the 3 new `isSetupPath` ones)

- [ ] **Step 5: Commit**

```bash
git add src/middleware.ts tests/middleware.test.ts
git commit -m "feat: redirect to /setup while configuration is incomplete"
```

---

### Task 12: Compiler-driven migration — `assertConfigured` at every broken call site

Task 4 made `AppConfig.plex/tautulli/sonarr/radarr/overseerr/smtp/publicBaseUrl` nullable. Any file that dereferences one of those fields without narrowing now fails to compile. This task finds and fixes every one of them, using the compiler itself as the checklist — don't try to pre-enumerate files by reading code; let `tsc` tell you.

**Files:** whichever files `tsc --noEmit` flags after Task 4 + Task 11 (expect roughly 5-10 — most of the 33 existing `loadConfig()` call sites only touch `session.secret`, `newsletterCronSecret`, `filesRootPath`, `storageVolumes`, etc., none of which changed type, so most call sites need zero changes).

**Interfaces:**
- Consumes: `assertConfigured` (Task 4)

- [ ] **Step 1: Run the compiler to get the exact list**

Run: `npx tsc --noEmit`
Expected: a list of errors, each pointing at a file/line that accesses `.plex.`, `.tautulli.`, `.sonarr.`, `.radarr.`, `.overseerr.`, or `.smtp.` (or uses `publicBaseUrl` as a bare string) on a value typed `AppConfig`.

- [ ] **Step 2: Fix each flagged file with the same mechanical transformation**

For every file `tsc` flagged: add `assertConfigured` to the existing `@/lib/config` import, and wrap the `loadConfig()` call. Two concrete examples of the exact transformation:

`src/app/api/auth/login/route.ts` — before:

```typescript
import { loadConfig } from '@/lib/config';
// ...
export async function POST(request: NextRequest) {
  const config = loadConfig();
  const { pinId, authUrl } = await createPin(config.plex.clientIdentifier);
```

after:

```typescript
import { loadConfig, assertConfigured } from '@/lib/config';
// ...
export async function POST(request: NextRequest) {
  const config = assertConfigured(loadConfig());
  const { pinId, authUrl } = await createPin(config.plex.clientIdentifier);
```

`src/app/api/auth/poll/route.ts` — same pattern: change the import to add `assertConfigured`, wrap `loadConfig()` at the point where `config.plex.clientIdentifier` (used for `clientIdentifier: config.plex.clientIdentifier`, line ~16) is read.

Apply the identical transformation — add `assertConfigured` to the import, wrap the `loadConfig()` call at the top of the function — to every other file `tsc` lists. Do not touch files `tsc` doesn't flag; they don't need this and adding it unnecessarily just adds noise.

- [ ] **Step 3: Re-run the compiler after each file, repeat until clean**

Run: `npx tsc --noEmit`
Expected: eventually `TypeScript: No errors found`. If a file still errors after being wrapped, re-read its exact error — it may be reading `config.plex.x` in a spot that runs *before* the wrap (e.g. a second, separate `loadConfig()` call in the same file that also needs wrapping).

- [ ] **Step 4: Run the full test suite to confirm nothing broke behaviorally**

Run: `npx vitest run`
Expected: PASS — every test that previously relied on `loadConfig()` throwing when a var was missing will now need its fixture updated in a later, dedicated pass (Task 14 covers the setup/admin-settings routes; any other test file `tsc` or `vitest` flags because it asserts on the old throw-on-missing-var behavior should have that specific assertion removed — the throw no longer happens, `isSetupComplete`/`assertConfigured` replace it).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix: narrow config to ConfiguredAppConfig at every post-setup call site"
```

---

### Task 13: `src/app/api/setup/step/route.ts`

**Files:**
- Create: `src/app/api/setup/step/route.ts`
- Test: `tests/api/setup-step.test.ts`

**Interfaces:**
- Consumes: `verifySetupToken` (Task 5), `applyServiceSettings` (Task 10), `isSetupComplete`, `loadConfig` (Task 4)

- [ ] **Step 1: Write the failing test**

```typescript
// tests/api/setup-step.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb, resetDbForTests } from '../../src/lib/db';
import { getOrCreateSetupToken } from '../../src/lib/setup';
import { getSetting } from '../../src/lib/settings';
import { POST } from '../../src/app/api/setup/step/route';

function postRequest(body: unknown, token?: string): NextRequest {
  return new NextRequest('http://localhost/api/setup/step', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/setup/step', () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it('rejects without a valid setup token', async () => {
    const request = postRequest({ service: 'publicBaseUrl', values: { PUBLIC_BASE_URL: 'https://portarr.example.com' } }, 'wrong-token');
    const response = await POST(request);
    expect(response.status).toBe(403);
  });

  it('accepts and persists with the correct token', async () => {
    const db = getDb(':memory:');
    const token = getOrCreateSetupToken(db);
    const request = postRequest({ service: 'publicBaseUrl', values: { PUBLIC_BASE_URL: 'https://portarr.example.com' } }, token);
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(getSetting(db, 'PUBLIC_BASE_URL')).toBe('https://portarr.example.com');
  });

  it('returns the connection-test error from applyServiceSettings', async () => {
    const db = getDb(':memory:');
    const token = getOrCreateSetupToken(db);
    const request = postRequest(
      { service: 'plex', values: { PLEX_URL: 'https://plex.invalid', PLEX_SERVER_TOKEN: 'bad', PLEX_SERVER_NAME: 'X' } },
      token
    );
    const response = await POST(request);
    expect(response.status).toBe(422);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api/setup-step.test.ts`
Expected: FAIL — `Cannot find module '../../src/app/api/setup/step/route'`

- [ ] **Step 3: Implement `src/app/api/setup/step/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { verifySetupToken } from '@/lib/setup';
import { applyServiceSettings } from '@/lib/setup-steps';
import type { ServiceKey } from '@/lib/settings-schema';

export async function POST(request: NextRequest) {
  const db = getDb();
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token || !verifySetupToken(db, token)) {
    return NextResponse.json({ error: 'invalid_setup_token' }, { status: 403 });
  }

  const body = (await request.json()) as { service?: string; values?: Record<string, string> };
  if (!body.service || !body.values) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const result = await applyServiceSettings(db, body.service as ServiceKey, body.values);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/api/setup-step.test.ts`
Expected: PASS (3/3)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/setup/step/route.ts tests/api/setup-step.test.ts
git commit -m "feat: add setup wizard step API route"
```

---

### Task 14: `src/app/api/setup/complete/route.ts` and `src/app/api/admin/settings/step/route.ts`

**Files:**
- Create: `src/app/api/setup/complete/route.ts`
- Create: `src/app/api/admin/settings/step/route.ts`
- Test: `tests/api/setup-complete.test.ts`
- Test: `tests/api/admin-settings-step.test.ts`

**Interfaces:**
- Consumes: `verifySetupToken`, `invalidateSetupToken` (Task 5), `loadConfig`, `isSetupComplete` (Task 4), `requireOwner` (existing `src/lib/route-auth.ts`), `applyServiceSettings` (Task 10)

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/api/setup-complete.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb, resetDbForTests } from '../../src/lib/db';
import { getOrCreateSetupToken, verifySetupToken } from '../../src/lib/setup';
import { setSetting } from '../../src/lib/settings';
import { POST } from '../../src/app/api/setup/complete/route';

const ALL_KEYS = {
  PUBLIC_BASE_URL: 'https://portarr.example.com',
  PLEX_URL: 'https://plex.example.com',
  PLEX_SERVER_TOKEN: 'token',
  PLEX_SERVER_NAME: 'Srv',
  TAUTULLI_URL: 'https://tautulli.example.com',
  TAUTULLI_API_KEY: 'tkey',
  SONARR_URL: 'https://sonarr.example.com',
  SONARR_API_KEY: 'skey',
  RADARR_URL: 'https://radarr.example.com',
  RADARR_API_KEY: 'rkey',
  OVERSEERR_URL: 'https://overseerr.example.com',
  OVERSEERR_API_KEY: 'okey',
  SMTP_HOST: 'mail.example.com',
  SMTP_PORT: '465',
  SMTP_USER: 'u',
  SMTP_PASS: 'p',
  MAIL_FROM_ADDRESS: 'a@example.com',
  MAIL_FROM_NAME: 'Portarr',
};

function postRequest(token?: string): NextRequest {
  return new NextRequest('http://localhost/api/setup/complete', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

describe('POST /api/setup/complete', () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it('rejects without a valid setup token', async () => {
    const response = await POST(postRequest('wrong'));
    expect(response.status).toBe(403);
  });

  it('rejects with 422 when setup is not actually complete yet', async () => {
    const db = getDb(':memory:');
    const token = getOrCreateSetupToken(db);
    const response = await POST(postRequest(token));
    expect(response.status).toBe(422);
  });

  it('invalidates the token and succeeds once every field is set', async () => {
    const db = getDb(':memory:');
    const token = getOrCreateSetupToken(db);
    for (const [key, value] of Object.entries(ALL_KEYS)) {
      setSetting(db, key, value);
    }
    const response = await POST(postRequest(token));
    expect(response.status).toBe(200);
    expect(verifySetupToken(db, token)).toBe(false);
  });
});
```

```typescript
// tests/api/admin-settings-step.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb, resetDbForTests } from '../../src/lib/db';
import { getSetting } from '../../src/lib/settings';
import { createSession, SESSION_COOKIE_NAME } from '../../src/lib/session';
import { POST } from '../../src/app/api/admin/settings/step/route';

const SECRET = 'test-secret-at-least-32-characters-long';
let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = { SESSION_SECRET: process.env.SESSION_SECRET };
  process.env.SESSION_SECRET = SECRET;
  resetDbForTests();
});

afterEach(() => {
  process.env.SESSION_SECRET = savedEnv.SESSION_SECRET;
});

async function ownerRequest(body: unknown): Promise<NextRequest> {
  const token = await createSession({ plexId: '1', email: 'owner@example.com', username: 'owner', isOwner: true }, SECRET);
  const request = new NextRequest('http://localhost/api/admin/settings/step', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  request.cookies.set(SESSION_COOKIE_NAME, token);
  return request;
}

describe('POST /api/admin/settings/step', () => {
  it('rejects without a session', async () => {
    const request = new NextRequest('http://localhost/api/admin/settings/step', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service: 'publicBaseUrl', values: { PUBLIC_BASE_URL: 'https://x.example.com' } }),
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('rejects a non-owner session', async () => {
    const token = await createSession({ plexId: '1', email: 'u@example.com', username: 'u', isOwner: false }, SECRET);
    const request = new NextRequest('http://localhost/api/admin/settings/step', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service: 'publicBaseUrl', values: { PUBLIC_BASE_URL: 'https://x.example.com' } }),
    });
    request.cookies.set(SESSION_COOKIE_NAME, token);
    const response = await POST(request);
    expect(response.status).toBe(403);
  });

  it('accepts and persists for an owner session', async () => {
    const db = getDb(':memory:');
    const request = await ownerRequest({ service: 'publicBaseUrl', values: { PUBLIC_BASE_URL: 'https://x.example.com' } });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(getSetting(db, 'PUBLIC_BASE_URL')).toBe('https://x.example.com');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/api/setup-complete.test.ts tests/api/admin-settings-step.test.ts`
Expected: FAIL — both route modules don't exist yet

- [ ] **Step 3: Implement `src/app/api/setup/complete/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { loadConfig, isSetupComplete } from '@/lib/config';
import { verifySetupToken, invalidateSetupToken } from '@/lib/setup';

export async function POST(request: NextRequest) {
  const db = getDb();
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token || !verifySetupToken(db, token)) {
    return NextResponse.json({ error: 'invalid_setup_token' }, { status: 403 });
  }

  const config = loadConfig(process.env, db);
  if (!isSetupComplete(config)) {
    return NextResponse.json({ error: 'setup_incomplete' }, { status: 422 });
  }

  invalidateSetupToken(db);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Implement `src/app/api/admin/settings/step/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireOwner } from '@/lib/route-auth';
import { applyServiceSettings } from '@/lib/setup-steps';
import type { ServiceKey } from '@/lib/settings-schema';

export async function POST(request: NextRequest) {
  const authError = await requireOwner(request);
  if (authError) return authError;

  const db = getDb();
  const body = (await request.json()) as { service?: string; values?: Record<string, string> };
  if (!body.service || !body.values) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const result = await applyServiceSettings(db, body.service as ServiceKey, body.values);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/api/setup-complete.test.ts tests/api/admin-settings-step.test.ts`
Expected: PASS (3/3 and 3/3)

- [ ] **Step 6: Commit**

```bash
git add src/app/api/setup/complete/route.ts src/app/api/admin/settings/step/route.ts tests/api/setup-complete.test.ts tests/api/admin-settings-step.test.ts
git commit -m "feat: add setup-complete and admin-settings API routes"
```

---

### Task 15: `ServiceSettingsForm` component

**Files:**
- Create: `src/components/ServiceSettingsForm.tsx`

No dedicated test file — this repo has no jsdom/testing-library (documented pattern: client components with hooks are verified visually, not unit-tested; see `PosterFanCarousel.tsx`/`HistoryLoadMore.tsx` for precedent). Verified visually in Task 17/18.

**Interfaces:**
- Consumes: `type FieldDef` (Task 3)
- Produces: `<ServiceSettingsForm fields testable onSubmit initialValues? configuredKeys? disabledKeys? />`

- [ ] **Step 1: Implement `src/components/ServiceSettingsForm.tsx`**

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import type { FieldDef } from '@/lib/settings-schema';

export interface ServiceSettingsFormProps {
  fields: FieldDef[];
  testable: boolean;
  onSubmit: (values: Record<string, string>) => Promise<{ ok: boolean; error: string | null }>;
  // Pre-fills text fields (URLs, names) on /admin/settings. Never used for
  // password-type fields — those start blank; see configuredKeys below.
  initialValues?: Record<string, string>;
  // Password fields already backed by a real value (env or DB) render a
  // "already configured" hint instead of the real secret, and submitting
  // blank keeps that value unchanged (applyServiceSettings handles the fallback).
  configuredKeys?: Set<string>;
  // Fields currently sourced from an env var — always env-priority, editing
  // them here would silently have no effect, so they're locked instead.
  disabledKeys?: Set<string>;
}

export function ServiceSettingsForm({
  fields,
  testable,
  onSubmit,
  initialValues,
  configuredKeys,
  disabledKeys,
}: ServiceSettingsFormProps) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(
      fields.map((f) => [f.envKey, f.type === 'text' ? initialValues?.[f.envKey] ?? '' : ''])
    )
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await onSubmit(values);
    setSubmitting(false);
    if (!result.ok) setError(result.error);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {fields.map((field) => {
        const disabled = disabledKeys?.has(field.envKey) ?? false;
        const alreadyConfigured = field.type === 'password' && (configuredKeys?.has(field.envKey) ?? false);
        return (
          <label key={field.envKey} className="flex flex-col gap-1 text-sm text-plexcrew-ash">
            {field.label}
            <input
              type={field.type === 'password' ? 'password' : 'text'}
              disabled={disabled}
              value={values[field.envKey]}
              placeholder={
                disabled
                  ? "Défini via variable d'environnement"
                  : alreadyConfigured
                    ? '•••••••• (laisser vide pour ne pas changer)'
                    : undefined
              }
              onChange={(e) => setValues({ ...values, [field.envKey]: e.target.value })}
              className="rounded-md border border-plexcrew-teal/20 bg-plexcrew-charcoal/60 px-3 py-2 text-plexcrew-screen disabled:opacity-50"
            />
          </label>
        );
      })}
      {error && <p className="text-sm text-plexcrew-amber">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-full bg-plexcrew-teal px-4 py-2 text-sm font-semibold text-plexcrew-ink disabled:opacity-50"
      >
        {submitting ? (testable ? 'Test en cours…' : 'Enregistrement…') : testable ? 'Tester et enregistrer' : 'Enregistrer'}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Run the typechecker**

Run: `npx tsc --noEmit`
Expected: `TypeScript: No errors found`

- [ ] **Step 3: Commit**

```bash
git add src/components/ServiceSettingsForm.tsx
git commit -m "feat: add shared service settings form component"
```

---

### Task 16: `/setup` page + `SetupWizard`

**Files:**
- Create: `src/app/setup/page.tsx`
- Create: `src/components/SetupWizard.tsx`

**Interfaces:**
- Consumes: `loadConfig`, `isSetupComplete` (Task 4), `getOrCreateSetupToken`, `verifySetupToken` (Task 5), `SERVICE_FIELDS`, `type ServiceKey` (Task 3), `ServiceSettingsForm` (Task 15)

- [ ] **Step 1: Implement `src/components/SetupWizard.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { ServiceSettingsForm } from './ServiceSettingsForm';
import { SERVICE_FIELDS, type ServiceKey } from '@/lib/settings-schema';

const STEPS: ServiceKey[] = ['publicBaseUrl', 'plex', 'tautulli', 'sonarr', 'radarr', 'overseerr', 'smtp'];

const STEP_TITLES: Record<ServiceKey, string> = {
  publicBaseUrl: 'URL publique',
  plex: 'Plex',
  tautulli: 'Tautulli',
  sonarr: 'Sonarr',
  radarr: 'Radarr',
  overseerr: 'Overseerr',
  smtp: 'SMTP',
};

export function SetupWizard({ token }: { token: string }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [done, setDone] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const step = STEPS[stepIndex];

  async function handleStepSubmit(values: Record<string, string>): Promise<{ ok: boolean; error: string | null }> {
    const res = await fetch('/api/setup/step', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ service: step, values }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error ?? 'Erreur inconnue' };
    }
    if (stepIndex === STEPS.length - 1) {
      await completeSetup();
    } else {
      setStepIndex(stepIndex + 1);
    }
    return { ok: true, error: null };
  }

  async function completeSetup() {
    setCompleting(true);
    setCompleteError(null);
    const res = await fetch('/api/setup/complete', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      setCompleteError(data.error ?? 'Erreur inconnue');
      setCompleting(false);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="font-display text-2xl text-plexcrew-screen">Configuration terminée</h1>
        <a href="/login" className="text-plexcrew-teal underline">
          Aller à la connexion →
        </a>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-plexcrew-screen">{STEP_TITLES[step]}</h1>
        <span className="text-xs text-plexcrew-ash">
          {stepIndex + 1} / {STEPS.length}
        </span>
      </div>
      <ServiceSettingsForm fields={SERVICE_FIELDS[step]} testable={step !== 'publicBaseUrl'} onSubmit={handleStepSubmit} />
      {completing && <p className="text-sm text-plexcrew-ash">Finalisation…</p>}
      {completeError && <p className="text-sm text-plexcrew-amber">{completeError}</p>}
    </main>
  );
}
```

- [ ] **Step 2: Implement `src/app/setup/page.tsx`**

```tsx
import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db';
import { loadConfig, isSetupComplete } from '@/lib/config';
import { getOrCreateSetupToken, verifySetupToken } from '@/lib/setup';
import { SetupWizard } from '@/components/SetupWizard';

export const dynamic = 'force-dynamic';

export default function SetupPage({ searchParams }: { searchParams: { token?: string } }) {
  const db = getDb();
  const config = loadConfig(process.env, db);

  if (isSetupComplete(config)) {
    redirect('/admin/settings');
  }

  const queryToken = searchParams.token;
  if (queryToken && verifySetupToken(db, queryToken)) {
    return <SetupWizard token={queryToken} />;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="font-display text-2xl text-plexcrew-screen">Configuration requise</h1>
      <p className="text-sm text-plexcrew-ash">
        Consultez les logs du conteneur (<code>docker logs portarr</code>) pour trouver le lien de configuration initiale.
      </p>
    </main>
  );
}
```

Note: this reads the token only from the `?token=` query string on every render (no cookie) — `getOrCreateSetupToken` is called separately, at container boot, by Task 19's boot-time hook, not from this page. If you land on `/setup` without `?token=`, you see the "check the logs" message; the link in the logs already includes `?token=...` so a normal first-run flow never hits that branch.

- [ ] **Step 3: Run the typechecker and build**

Run: `npx tsc --noEmit && npx next build`
Expected: both clean

- [ ] **Step 4: Commit**

```bash
git add src/app/setup/page.tsx src/components/SetupWizard.tsx
git commit -m "feat: add first-run setup wizard page"
```

---

### Task 17: `/admin/settings` page + `AdminSettingsPanel`

**Files:**
- Create: `src/app/admin/settings/page.tsx`
- Create: `src/components/AdminSettingsPanel.tsx`
- Modify: `src/app/admin/page.tsx` (add nav card)

**Interfaces:**
- Consumes: `getConfigSources` (Task 4), `SERVICE_FIELDS`, `type ServiceKey` (Task 3), `ServiceSettingsForm` (Task 15)

- [ ] **Step 1: Implement `src/components/AdminSettingsPanel.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { ServiceSettingsForm } from './ServiceSettingsForm';
import { SERVICE_FIELDS, type ServiceKey } from '@/lib/settings-schema';
import type { ConfigSource } from '@/lib/config';

const SERVICE_TITLES: Record<ServiceKey, string> = {
  publicBaseUrl: 'URL publique',
  plex: 'Plex',
  tautulli: 'Tautulli',
  sonarr: 'Sonarr',
  radarr: 'Radarr',
  overseerr: 'Overseerr',
  smtp: 'SMTP',
};

const SERVICES: ServiceKey[] = ['publicBaseUrl', 'plex', 'tautulli', 'sonarr', 'radarr', 'overseerr', 'smtp'];

export function AdminSettingsPanel({ sources }: { sources: Record<string, ConfigSource> }) {
  const [savedNotice, setSavedNotice] = useState<ServiceKey | null>(null);

  async function handleSubmit(service: ServiceKey, values: Record<string, string>) {
    const res = await fetch('/api/admin/settings/step', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service, values }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      return { ok: false as const, error: data.error ?? 'Erreur inconnue' };
    }
    setSavedNotice(service);
    return { ok: true as const, error: null };
  }

  return (
    <div className="space-y-8">
      {SERVICES.map((service) => {
        const fields = SERVICE_FIELDS[service];
        const disabledKeys = new Set(fields.filter((f) => sources[f.envKey] === 'env').map((f) => f.envKey));
        const configuredKeys = new Set(fields.filter((f) => sources[f.envKey] !== 'unset').map((f) => f.envKey));
        return (
          <section key={service} className="pc-glass-surface rounded-lg p-5 ring-1 ring-plexcrew-teal/15">
            <h2 className="mb-3 font-display text-xl text-plexcrew-screen">{SERVICE_TITLES[service]}</h2>
            <ServiceSettingsForm
              fields={fields}
              testable={service !== 'publicBaseUrl'}
              disabledKeys={disabledKeys}
              configuredKeys={configuredKeys}
              onSubmit={(values) => handleSubmit(service, values)}
            />
            {savedNotice === service && <p className="mt-2 text-sm text-plexcrew-teal">Enregistré.</p>}
          </section>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Implement `src/app/admin/settings/page.tsx`**

```tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { verifySession, SESSION_COOKIE_NAME } from '@/lib/session';
import { loadConfig, getConfigSources } from '@/lib/config';
import { getDb } from '@/lib/db';
import { AdminSettingsPanel } from '@/components/AdminSettingsPanel';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  const db = getDb();
  const config = loadConfig(process.env, db);
  const sessionUser = token ? await verifySession(token, config.session.secret) : null;

  if (!sessionUser) {
    redirect('/login');
  }
  if (!sessionUser.isOwner) {
    redirect('/');
  }

  const sources = getConfigSources(process.env, db);

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-6 sm:p-8">
      <header className="pc-glass-surface-strong sticky top-0 z-10 -mx-6 -mt-6 flex items-center justify-between gap-4 border-b border-plexcrew-teal/20 px-6 py-4 sm:-mx-8 sm:-mt-8 sm:px-8">
        <h1 className="font-display text-3xl leading-none tracking-[0.1em] text-plexcrew-screen">Réglages</h1>
        <Link
          href="/admin"
          className="flex-none rounded-md border border-plexcrew-teal/30 px-3 py-2 text-sm font-medium text-plexcrew-screen transition-colors hover:border-plexcrew-teal"
        >
          ← Retour à l'administration
        </Link>
      </header>
      <AdminSettingsPanel sources={sources} />
    </main>
  );
}
```

- [ ] **Step 3: Add a nav card on the admin hub**

In `src/app/admin/page.tsx`, in the `<section className="grid grid-cols-1 gap-4 sm:grid-cols-2">` block that already has the "Membres" and "Mailings" cards, add a third:

```tsx
<AdminNavCard href="/admin/settings" title="Réglages" description="Plex, Tautulli, Sonarr, Radarr, Overseerr, SMTP" />
```

- [ ] **Step 4: Run the typechecker and build**

Run: `npx tsc --noEmit && npx next build`
Expected: both clean

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/settings/page.tsx src/components/AdminSettingsPanel.tsx src/app/admin/page.tsx
git commit -m "feat: add owner-only settings page for post-setup editing"
```

---

### Task 18: Log the setup token on boot

The wizard needs the token available somewhere the self-hoster can find it (`docker logs`) the very first time the container starts with nothing configured.

**Files:**
- Modify: `src/app/layout.tsx` (or a dedicated boot hook — see below)

**Interfaces:**
- Consumes: `getOrCreateSetupToken` (Task 5), `isSetupComplete`, `loadConfig` (Task 4)

- [ ] **Step 1: Add a one-time boot log**

Next.js App Router has no single "on server start" hook that isn't tied to a request. The simplest correct place, given this app's existing `export const dynamic = 'force-dynamic'` root layout that already runs `loadConfig()` on every request (`src/app/layout.tsx`), is to log once per process using a module-level guard so it doesn't spam on every request:

In `src/app/layout.tsx`, near the top of the file (module scope, outside the component):

```typescript
let setupTokenLogged = false;

function logSetupTokenOnce(config: ReturnType<typeof loadConfig>, db: ReturnType<typeof getDb>) {
  if (setupTokenLogged || isSetupComplete(config)) return;
  setupTokenLogged = true;
  const token = getOrCreateSetupToken(db);
  const url = `${config.publicBaseUrl ?? 'http://localhost:3000'}/setup?token=${token}`;
  console.log(`\n=== Portarr — configuration initiale requise ===\nOuvrez : ${url}\n`);
}
```

Add the needed imports (`getOrCreateSetupToken` from `@/lib/setup`, `getDb` from `@/lib/db`) and call `logSetupTokenOnce(config, getDb())` inside `RootLayout`, right after `const config = loadConfig();` (which — per Task 12's reasoning — does **not** need `assertConfigured` here, since this call site deliberately reads `isSetupComplete`/`publicBaseUrl` on the nullable `AppConfig`, not a narrowed one).

Note `config.publicBaseUrl` is still null at this point (setup isn't complete), so the fallback `'http://localhost:3000'` is what actually gets logged in the normal case — accurate for the default Docker port mapping documented in the wiki.

- [ ] **Step 2: Run the typechecker and build**

Run: `npx tsc --noEmit && npx next build`
Expected: both clean

- [ ] **Step 3: Manually verify the log line appears**

Run: `rm -f /tmp/portarr-setup-test.db && DATABASE_PATH=/tmp/portarr-setup-test.db npx next start &` then hit `curl http://localhost:3000/` once and check the server's stdout for the `=== Portarr — configuration initiale requise ===` line. Kill the process afterward.

- [ ] **Step 4: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat: log the first-run setup URL to stdout once"
```

---

### Task 19: `.env.example` + doc note

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add a note at the top of `.env.example`**

Above the existing var list, add:

```
# As of the admin config wizard (see docs/superpowers/specs/2026-09-16-admin-config-wizard-design.md),
# the vars below are OPTIONAL — leave them unset and Portarr will walk you
# through a setup wizard on first launch instead. Setting them here still
# works exactly as before and always takes precedence over the wizard/UI.
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: note that service config vars are now optional (setup wizard)"
```

(The GitHub wiki's "Installation"/"Configuration Reference" pages need the same update — done manually after merge, same workflow as every prior wiki update for this project; not part of this repo's git history.)

---

### Task 20: Full-suite verification + live smoke test

**Files:** none (verification only)

- [ ] **Step 1: Full automated verification**

Run, in order:
```bash
npx tsc --noEmit
npx vitest run
npx next build
```
Expected: all three clean (0 errors/warnings, all tests passing).

- [ ] **Step 2: Live smoke test against a throwaway instance**

Using a fresh SQLite file and no service env vars set (`DATABASE_PATH` only), start the built app and, in a real browser:
1. Confirm any page redirects to `/setup`.
2. Confirm `/setup` without `?token=` shows the "check the logs" message, and the real link from stdout works.
3. Walk through all 7 wizard steps with real (or deliberately wrong, to confirm the test-gate) credentials for each service.
4. Confirm `/setup` redirects to `/login` after `POST /api/setup/complete` succeeds.
5. Log in as the owner, visit `/admin/settings`, confirm every field is pre-filled/masked correctly and env-sourced fields (if any were set) render disabled.
6. Edit one field (e.g. Sonarr URL) without touching Sonarr's API key field, save, confirm it persisted correctly via a second page load.

- [ ] **Step 3: Report results, no commit** (this task is verification-only)

---

## Self-Review Notes

- **Spec coverage:** storage/precedence → Task 4; first-run token security → Task 5, 13, 14, 18; wizard steps + mandatory test-before-save → Tasks 6-10, 16; post-setup editing + disabled-when-env-sourced + secret masking → Tasks 15, 17; testing → every task's TDD steps + Task 20; migration note (backwards compat) → Task 4's env>DB precedence + Task 19; docs → Task 19.
- **Type consistency checked:** `ServiceKey`/`SERVICE_FIELDS` (Task 3) used identically by `setup-steps.ts` (Task 10), both API routes (Tasks 13-14), and both form-rendering components (Tasks 16-17). `ConnectionTestResult`/`StepResult` shape (`{ ok, error }`) kept identical across `connection-test.ts` and `setup-steps.ts` so `applyServiceSettings` can return a test failure directly without remapping.
- **Jellyfin:** confirmed absent from every task — out of scope per spec.
