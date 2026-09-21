# Jellyfin adapter (sub-project 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Jellyfin as a second media server next to Plex + Tautulli: configuration, password login, membership, recently-added, search, posters and member emails from Seerr/Overseerr.

**Architecture:** A `createJellyfinProvider` adapter implements the `MediaServer` interface from sub-project 1, on top of a low-level `jellyfin.ts` module. `ProviderAuth` gains a `password` variant, `MediaServer` gains poster methods so the poster proxy can route by provider, and the login page renders one control per active provider. Emails for Jellyfin members are looked up in Seerr/Overseerr.

**Tech Stack:** Next.js 14 (App Router, Edge middleware), TypeScript strict, better-sqlite3, jose, vitest.

**Spec:** `docs/superpowers/specs/2026-09-21-jellyfin-adapter-design.md` (includes the verified "Spike results"). Builds on sub-project 1 (`docs/superpowers/specs/2026-09-21-media-server-abstraction-design.md`).

## Global Constraints

- **Scope:** Jellyfin runs **alongside** Plex + Tautulli. Plex and Tautulli stay required; `isSetupComplete` does not change. No now-playing / stats / history code for Jellyfin (sub-project 3, which also adds Jellystat as a choice instead of Tautulli). `ConfiguredAppConfig.plex` / `tautulli` stay non-null.
- **Jellyfin auth header (verified on Jellyfin 12.1.0).** Every API-key call sends `Authorization: MediaBrowser Client="Portarr", Device="Portarr", DeviceId="portarr", Version="1", Token="<apiKey>"`. `X-Emby-Token`, `X-MediaBrowser-Token` and `?api_key=` return 401 and must not be used. `POST /Users/AuthenticateByName` sends the same header **without** the `Token` part (without any header the server answers 400; unknown user or wrong credentials answer 401 with an opaque body).
- **Ids:** Jellyfin user and item ids are 32 hex characters without dashes; compare ids case-insensitively with dashes stripped.
- **Password handling:** the Jellyfin password is never stored, never logged, never included in an error message or a response, and never sent anywhere except `POST /Users/AuthenticateByName`.
- **Identity:** a Jellyfin member is `{ provider: 'jellyfin', userId: <Jellyfin User.Id> }`. No merging with Plex accounts.
- **Edge runtime:** `src/middleware.ts` and everything it transitively imports at runtime (now including `media/jellyfin-provider.ts` and `media/jellyfin.ts` through `media/membership.ts`) must not import `src/lib/config.ts`, `src/lib/db.ts`, `better-sqlite3`, `fs`, `path` or any `node:` module. Type-only imports are fine. Guarded by `tests/middleware-edge-imports.test.ts`, which must keep passing.
- **No regression for Plex:** all French UI strings, API response shapes and error messages for existing behavior stay byte-identical (including `'Trop de tentatives, réessayez plus tard.'` and `'Failed to initiate login'`).
- **Known pre-existing failure:** `tests/api/dashboard-stats.test.ts` (`recentHistory` empty) fails on `main`. Do not fix it and do not count it as a regression.
- **Commits:** end every commit message with a second `-m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"`. Work only on branch `feat/jellyfin-adapter` (stacked on `feat/media-server-abstraction`); never push and never touch `main` unless the user asks.
- **Working directory:** the repo root of the feature-branch clone (the directory containing `package.json`). All paths below are relative to it. If a test run leaves an untracked `data/` directory or a `*.pre-provider-migration*` file in the repo root, delete it before committing.

## File Structure

New:

| File | Responsibility |
|---|---|
| `src/lib/media/jellyfin.ts` | Low-level Jellyfin API functions (injected `fetchFn`), poster-ref and deep-link helpers |
| `src/lib/media/jellyfin-provider.ts` | `createJellyfinProvider(cfg, fetchFn)` implementing `MediaServer` |
| `src/lib/media/seerr-emails.ts` | `fetchSeerrUsers`, `enrichMembersWithEmail` |
| `src/lib/media/labels.ts` | `providerLabel(provider)` for the admin badge |
| `src/lib/login.ts` | `completeLogin` (upsert user + session cookie) and `resolveLoginEmail`, shared by Plex poll and Jellyfin password login |
| `src/app/api/auth/password/route.ts` | `POST /api/auth/password` for password-based providers |
| `src/components/PlexLoginButton.tsx`, `src/components/JellyfinLoginForm.tsx` | Client login controls; `src/app/login/page.tsx` becomes a server component that picks them |

Modified: `src/lib/media/types.ts`, `plex.ts`, `plex-provider.ts`, `registry.ts`, `membership.ts`; `src/app/api/newsletter/poster/route.ts`; `src/app/api/auth/login/route.ts`, `poll/route.ts`; `src/lib/config.ts`, `settings-schema.ts`, `connection-test.ts`, `setup-steps.ts`; `src/components/SetupWizard.tsx`, `ServiceSettingsForm.tsx`, `AdminSettingsPanel.tsx`, `AdminMembersList.tsx`; `src/app/api/admin/members/sync/route.ts`; `.env.example`, `README.md`; and the matching tests.

---

### Task 1: Interface additions (password auth, poster methods) and the Plex poster behind them

No Jellyfin code yet. Pure refactor: the poster proxy now asks each active provider, and Plex handles its own posters.

**Files:**
- Modify: `src/lib/media/types.ts`, `src/lib/media/plex.ts`, `src/lib/media/plex-provider.ts`, `src/lib/media/registry.ts`
- Modify: `src/app/api/newsletter/poster/route.ts`, `src/app/api/auth/login/route.ts`, `src/app/api/auth/poll/route.ts`
- Test: `tests/lib/media/fake-provider.ts`, `tests/lib/media/plex-provider.test.ts`, `tests/lib/media/registry.test.ts`; `tests/api/newsletter-poster.test.ts` must pass unchanged

**Interfaces:**
- Produces (`types.ts`):
  ```ts
  interface PosterResult { bytes: ArrayBuffer; contentType: string }
  type PasswordResult = { status: 'denied' } | { status: 'ok'; user: MediaMember; isOwner: boolean }
  interface PasswordAuth { kind: 'password'; authenticate(username: string, password: string): Promise<PasswordResult> }
  type ProviderAuth = PinAuth | PasswordAuth
  // MediaServer gains:
  handlesPoster(ref: string): boolean
  poster(ref: string): Promise<PosterResult | null>
  ```
- Produces (`plex.ts`): `PLEX_POSTER_PATH: RegExp`, `fetchPlexPoster(plexUrl, serverToken, path, fetchFn?): Promise<PosterResult | null>`
- Produces (`registry.ts`): `getPinAuth(config, id, fetchFn?): PinAuth`, `getPasswordAuth(config, id, fetchFn?): PasswordAuth` (each throws when the provider is inactive or uses the other auth kind)

- [ ] **Step 1: Write the failing tests**

Append to `tests/lib/media/registry.test.ts` (inside the file, after the existing `describe('getProvider', ...)`, importing `getPinAuth`, `getPasswordAuth` next to the existing imports):

```ts
describe('getPinAuth / getPasswordAuth', () => {
  it('getPinAuth returns the plex pin auth', () => {
    expect(getPinAuth({ plex: PLEX, tautulli: TAUTULLI }, 'plex').kind).toBe('pin');
  });

  it('getPasswordAuth refuses a provider that uses pin auth', () => {
    expect(() => getPasswordAuth({ plex: PLEX, tautulli: TAUTULLI }, 'plex')).toThrow(/does not use password auth/);
  });

  it('both throw when the provider is not active', () => {
    expect(() => getPinAuth({ plex: null, tautulli: null }, 'plex')).toThrow(/not active/);
    expect(() => getPasswordAuth({ plex: PLEX, tautulli: TAUTULLI }, 'jellyfin')).toThrow(/not active/);
  });
});
```

Append to `tests/lib/media/plex-provider.test.ts` (same `describe('createPlexProvider', ...)` block, before its closing `});`):

```ts
  it('handlesPoster accepts only Plex thumb paths', () => {
    const p = createPlexProvider(CFG, fetchStub({}));
    expect(p.handlesPoster('/library/metadata/1/thumb/1')).toBe(true);
    expect(p.handlesPoster('/etc/passwd')).toBe(false);
    expect(p.handlesPoster('jellyfin:0123456789abcdef0123456789abcdef')).toBe(false);
  });

  it('poster fetches the resized Plex transcode and returns bytes + content type', async () => {
    const fetchFn = vi.fn(
      async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'Content-Type': 'image/jpeg' } })
    ) as unknown as typeof fetch;
    const p = createPlexProvider(CFG, fetchFn);
    const result = await p.poster('/library/metadata/1/thumb/1');
    expect(result?.contentType).toBe('image/jpeg');
    expect(Array.from(new Uint8Array(result!.bytes))).toEqual([1, 2, 3]);
    const url = String((fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(url).toContain('http://plex.local:32400/photo/:/transcode?');
    expect(url).toContain('width=300');
    expect(url).toContain('X-Plex-Token=tok');
  });

  it('poster returns null for a foreign ref without fetching, and for an upstream failure', async () => {
    const fetchFn = vi.fn(async () => new Response('nope', { status: 404 })) as unknown as typeof fetch;
    const p = createPlexProvider(CFG, fetchFn);
    expect(await p.poster('jellyfin:0123456789abcdef0123456789abcdef')).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
    expect(await p.poster('/library/metadata/1/thumb/1')).toBeNull();
  });
```

Update `tests/lib/media/fake-provider.ts`: add `handlesPoster: () => false,` and `poster: async () => null,` to the returned object (before `...overrides`).

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/lib/media/registry.test.ts tests/lib/media/plex-provider.test.ts`
Expected: FAIL (`getPinAuth` / `handlesPoster` / `poster` do not exist).

- [ ] **Step 3: Extend `src/lib/media/types.ts`**

Replace

```ts
// Sub-project 2 widens this to `PinAuth | PasswordAuth`.
export type ProviderAuth = PinAuth;
```
with
```ts
export type PasswordResult =
  | { status: 'denied' }
  | { status: 'ok'; user: MediaMember; isOwner: boolean };

export interface PasswordAuth {
  kind: 'password';
  /** Never logs or persists the password. `denied` covers a wrong password, an unknown account and a disabled account alike. */
  authenticate(username: string, password: string): Promise<PasswordResult>;
}

export type ProviderAuth = PinAuth | PasswordAuth;

export interface PosterResult {
  bytes: ArrayBuffer;
  contentType: string;
}
```

and add these two members to the `MediaServer` interface (after `search`):

```ts
  /** True when `ref` (the opaque `thumbPath` string an item carried) belongs to this provider. */
  handlesPoster(ref: string): boolean;
  /** A resized poster for `ref`, or null when it cannot be fetched. Only called when `handlesPoster(ref)` is true. */
  poster(ref: string): Promise<PosterResult | null>;
```

- [ ] **Step 4: Move the Plex poster logic into `src/lib/media/plex.ts`**

Add `PosterResult` to the existing type import (`import type { MediaMember, PosterResult, RecentlyAddedItem, RecentlyAddedSplit, SearchResultItem } from './types';`) and append at the end of the file:

```ts
// Plex item posters are addressed as /library/metadata/<id>/thumb/<ts>.
export const PLEX_POSTER_PATH = /^\/library\/metadata\/\d+\/thumb\/\d+$/;

// Request a resized copy from Plex's own photo transcoder instead of the raw
// thumb — the raw file is the full source poster (seen in practice:
// 2000x3000, ~1.5MB) while every consumer here renders it at a few hundred
// CSS pixels at most. 300x450 covers every current call site (including
// retina) at a fraction of the weight.
export async function fetchPlexPoster(
  plexUrl: string,
  serverToken: string,
  path: string,
  fetchFn: typeof fetch = fetch
): Promise<PosterResult | null> {
  const transcodeUrl =
    `${plexUrl}/photo/:/transcode?width=300&height=450&minSize=1&upscale=0` +
    `&url=${encodeURIComponent(path)}&X-Plex-Token=${serverToken}`;
  const res = await fetchFn(transcodeUrl);
  if (!res.ok) return null;
  return { bytes: await res.arrayBuffer(), contentType: res.headers.get('content-type') ?? 'image/jpeg' };
}
```

- [ ] **Step 5: Implement the Plex provider methods**

In `src/lib/media/plex-provider.ts` add `fetchPlexPoster, PLEX_POSTER_PATH` to the import from `./plex`, and add to the returned object (after `search`):

```ts
    handlesPoster: (ref) => PLEX_POSTER_PATH.test(ref),
    poster: (ref) =>
      PLEX_POSTER_PATH.test(ref)
        ? fetchPlexPoster(cfg.url, cfg.serverToken, ref, fetchFn)
        : Promise.resolve(null),
```

- [ ] **Step 6: Add the typed auth helpers to `src/lib/media/registry.ts`**

Add `PasswordAuth, PinAuth` to the type import from `./types`, and append:

```ts
export function getPinAuth(config: ProviderConfigSource, id: ProviderId, fetchFn: typeof fetch = fetch): PinAuth {
  const auth = getProvider(config, id, fetchFn).auth;
  if (auth.kind !== 'pin') {
    throw new Error(`Media provider "${id}" does not use pin auth`);
  }
  return auth;
}

export function getPasswordAuth(
  config: ProviderConfigSource,
  id: ProviderId,
  fetchFn: typeof fetch = fetch
): PasswordAuth {
  const auth = getProvider(config, id, fetchFn).auth;
  if (auth.kind !== 'password') {
    throw new Error(`Media provider "${id}" does not use password auth`);
  }
  return auth;
}
```

- [ ] **Step 7: Narrow the Plex login routes**

`src/app/api/auth/login/route.ts`: replace the import `import { getProvider } from '@/lib/media/registry';` with `import { getPinAuth } from '@/lib/media/registry';` and the call `getProvider(config, 'plex').auth.createPin()` with `getPinAuth(config, 'plex').createPin()` (keep the existing comment above it, changing its wording to: `Plex logs in through the PIN flow; Jellyfin uses POST /api/auth/password.`).

`src/app/api/auth/poll/route.ts`: same import change and `getProvider(config, 'plex').auth.resolvePin(pinId)` becomes `getPinAuth(config, 'plex').resolvePin(pinId)` (same comment wording).

- [ ] **Step 8: Route the poster proxy through the providers**

Replace the whole of `src/app/api/newsletter/poster/route.ts` below the `PLACEHOLDER_SVG` / `placeholderPosterResponse` definitions (keep the top comment block, the `PLACEHOLDER_SVG` constant and `placeholderPosterResponse()` exactly as they are; delete the `VALID_PATH` constant and its import use) with:

```ts
export async function GET(request: NextRequest) {
  try {
    const ref = request.nextUrl.searchParams.get('path');
    if (!ref) {
      return placeholderPosterResponse();
    }

    // Pre-setup (or Plex not configured), assertConfigured throws — caught
    // below and degraded to the same placeholder as any other upstream
    // failure, which is exactly the right behavior for this route.
    const config = assertConfigured(loadConfig(process.env, getDb()));

    // Each provider recognizes only its own poster refs (Plex thumb paths,
    // Jellyfin `jellyfin:<id>`); a ref nobody handles is malformed or foreign.
    // Same degrade-to-placeholder contract as an upstream failure: every
    // consumer is a Server Component with no onError fallback, so an error
    // status here would render as a broken-image glyph instead of a blank one.
    const provider = getActiveProviders(config).find((p) => p.handlesPoster(ref));
    if (!provider) {
      return placeholderPosterResponse();
    }

    const poster = await provider.poster(ref);
    if (!poster) {
      return placeholderPosterResponse();
    }

    return new NextResponse(poster.bytes, {
      status: 200,
      headers: { 'Content-Type': poster.contentType, 'Cache-Control': 'public, max-age=86400, immutable' },
    });
  } catch (err) {
    console.error('Failed to proxy newsletter poster:', err);
    return placeholderPosterResponse();
  }
}
```

and change the route's imports to:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { loadConfig, assertConfigured } from '@/lib/config';
import { getDb } from '@/lib/db';
import { getActiveProviders } from '@/lib/media/registry';
```

- [ ] **Step 9: Verify**

```bash
npx vitest run tests/lib/media tests/api/newsletter-poster.test.ts tests/api/auth.test.ts 2>&1 | tail -20
npm run typecheck 2>&1 | tail -20
npx vitest run 2>&1 | tail -15
```

Expected: the new tests PASS; `newsletter-poster.test.ts` and `auth.test.ts` pass unchanged; typecheck clean; whole suite green except the one pre-existing `dashboard-stats` failure.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor: add password auth and poster methods to MediaServer, route posters by provider" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Low-level Jellyfin API module

**Files:**
- Create: `src/lib/media/jellyfin.ts`
- Test: `tests/lib/media/jellyfin.test.ts`

**Interfaces:**
- Consumes: `PosterResult` from `./types` (Task 1); `timeoutSignal` from `../fetch-timeout`.
- Produces (all exported from `src/lib/media/jellyfin.ts`):
  ```ts
  interface JellyfinProviderConfig { url: string; apiKey: string }   // url without trailing slash
  interface JellyfinUser { id: string; name: string; isAdministrator: boolean; isDisabled: boolean }
  interface JellyfinItem {
    id: string; name: string; type: string; serverId: string | null; dateCreated: string | null;
    productionYear: number | null; seriesName: string | null; seriesId: string | null; seasonId: string | null;
    hasPrimaryImage: boolean; parentPrimaryImageItemId: string | null; hasSeriesPrimaryImage: boolean;
  }
  type JellyfinAuthResult = { status: 'denied' } | { status: 'ok'; user: JellyfinUser; accessToken: string }
  jellyfinClientAuth(): string
  jellyfinTokenAuth(token: string): string
  listUsers(cfg, fetchFn?): Promise<JellyfinUser[]>
  authenticateByName(cfg, username, password, fetchFn?): Promise<JellyfinAuthResult>
  logoutSession(cfg, accessToken, fetchFn?): Promise<void>
  getRecentItems(cfg, type: 'Movie' | 'Episode', limit: number, fetchFn?): Promise<JellyfinItem[]>
  searchItems(cfg, query: string, limit: number, fetchFn?): Promise<JellyfinItem[]>
  fetchJellyfinPoster(cfg, itemId: string, fetchFn?): Promise<PosterResult | null>
  jellyfinPosterRef(itemId: string): string            // 'jellyfin:<id>'
  parseJellyfinPosterRef(ref: string): string | null   // the id, or null when not a valid Jellyfin ref
  jellyfinWebUrl(baseUrl: string, itemId: string, serverId: string | null): string
  ```

- [ ] **Step 1: Write the failing tests**

`tests/lib/media/jellyfin.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import {
  jellyfinClientAuth,
  jellyfinTokenAuth,
  listUsers,
  authenticateByName,
  logoutSession,
  getRecentItems,
  searchItems,
  fetchJellyfinPoster,
  jellyfinPosterRef,
  parseJellyfinPosterRef,
  jellyfinWebUrl,
} from '../../../src/lib/media/jellyfin';

const CFG = { url: 'http://jellyfin.local:8096', apiKey: 'key123' };
const ID = '1a2b3c4d5e6f47a8b9c0d1e2f3a4b5c6';

function res(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: async () => body,
    headers: new Headers({ 'content-type': 'application/json' }),
    arrayBuffer: async () => new ArrayBuffer(0),
  } as unknown as Response;
}

function calls(fetchFn: typeof fetch): Array<[string, RequestInit]> {
  return (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls as Array<[string, RequestInit]>;
}

describe('auth headers', () => {
  it('the client header has the Client/Device/DeviceId/Version parts and no token', () => {
    expect(jellyfinClientAuth()).toBe(
      'MediaBrowser Client="Portarr", Device="Portarr", DeviceId="portarr", Version="1"'
    );
  });

  it('the token header appends the token and strips quotes and line breaks from it', () => {
    expect(jellyfinTokenAuth('abc')).toBe(
      'MediaBrowser Client="Portarr", Device="Portarr", DeviceId="portarr", Version="1", Token="abc"'
    );
    expect(jellyfinTokenAuth('a"b\r\nc')).toContain('Token="abc"');
  });
});

describe('listUsers', () => {
  it('sends the token header and maps users (there is no email field on Jellyfin users)', async () => {
    const fetchFn = vi.fn(async () =>
      res([
        { Id: ID, Name: 'alice', Policy: { IsAdministrator: true, IsDisabled: false, IsHidden: true } },
        { Id: 'b'.repeat(32), Name: 'guest', Policy: { IsAdministrator: false, IsDisabled: true } },
      ])
    ) as unknown as typeof fetch;
    const users = await listUsers(CFG, fetchFn);
    expect(users).toEqual([
      { id: ID, name: 'alice', isAdministrator: true, isDisabled: false },
      { id: 'b'.repeat(32), name: 'guest', isAdministrator: false, isDisabled: true },
    ]);
    const [url, init] = calls(fetchFn)[0];
    expect(url).toBe('http://jellyfin.local:8096/Users');
    expect((init.headers as Record<string, string>).Authorization).toContain('Token="key123"');
  });

  it('throws with the status when Jellyfin answers non-ok', async () => {
    const fetchFn = vi.fn(async () => res({}, 401)) as unknown as typeof fetch;
    await expect(listUsers(CFG, fetchFn)).rejects.toThrow('Jellyfin API request failed: 401');
  });
});

describe('authenticateByName', () => {
  it('posts Username/Pw with the client header (no token) and returns the user and access token', async () => {
    const fetchFn = vi.fn(async () =>
      res({ User: { Id: ID, Name: 'alice', Policy: { IsAdministrator: true, IsDisabled: false } }, AccessToken: 'tok' })
    ) as unknown as typeof fetch;
    const result = await authenticateByName(CFG, 'alice', 's3cret', fetchFn);
    expect(result).toEqual({
      status: 'ok',
      user: { id: ID, name: 'alice', isAdministrator: true, isDisabled: false },
      accessToken: 'tok',
    });
    const [url, init] = calls(fetchFn)[0];
    expect(url).toBe('http://jellyfin.local:8096/Users/AuthenticateByName');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ Username: 'alice', Pw: 's3cret' });
    const auth = (init.headers as Record<string, string>).Authorization;
    expect(auth).toBe(jellyfinClientAuth());
    expect(auth).not.toContain('Token=');
  });

  it('returns denied on 401 (wrong password and unknown account are indistinguishable)', async () => {
    const fetchFn = vi.fn(async () => res('Error processing request.', 401)) as unknown as typeof fetch;
    expect(await authenticateByName(CFG, 'x', 'y', fetchFn)).toEqual({ status: 'denied' });
  });

  it('throws on other failures without leaking the password into the message', async () => {
    const fetchFn = vi.fn(async () => res({}, 500)) as unknown as typeof fetch;
    const error = await authenticateByName(CFG, 'x', 'p4ssw0rd-secret', fetchFn).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('500');
    expect((error as Error).message).not.toContain('p4ssw0rd-secret');
  });

  it('throws when a 200 response has no user or no token', async () => {
    const fetchFn = vi.fn(async () => res({ User: { Id: ID } })) as unknown as typeof fetch;
    await expect(authenticateByName(CFG, 'x', 'y', fetchFn)).rejects.toThrow(/missing/);
  });
});

describe('logoutSession', () => {
  it('posts to /Sessions/Logout with the user token in the header', async () => {
    const fetchFn = vi.fn(async () => res(null, 204)) as unknown as typeof fetch;
    await logoutSession(CFG, 'usertoken', fetchFn);
    const [url, init] = calls(fetchFn)[0];
    expect(url).toBe('http://jellyfin.local:8096/Sessions/Logout');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toContain('Token="usertoken"');
  });

  it('throws when the logout is refused', async () => {
    const fetchFn = vi.fn(async () => res({}, 401)) as unknown as typeof fetch;
    await expect(logoutSession(CFG, 't', fetchFn)).rejects.toThrow('401');
  });
});

describe('getRecentItems', () => {
  const RAW_EPISODE_ORPHAN = {
    Id: 'e88b8620b06e4462ece7eb2dd20157c1',
    Name: 'Has Fallen - S02E03',
    Type: 'Episode',
    ServerId: 'srv',
    DateCreated: '2026-09-21T14:06:43.300184Z',
    ImageTags: {},
    ParentPrimaryImageItemId: 'f2b38fba124afa939639eed2cb1f8e4d',
  };
  const RAW_EPISODE = {
    Id: '92d37a61bbdef9dfb98f3fca21b7dec0',
    Name: "A New New York Yankee in King Elfo's Court",
    Type: 'Episode',
    ServerId: 'srv',
    DateCreated: '2026-09-21T09:13:21.3359525Z',
    ProductionYear: 2026,
    SeriesName: 'Futurama',
    SeriesId: 'eb8e30f47579210b3576e393001074c5',
    SeasonId: 'a846ff2cf5a4d89d6d0e6593d2475cab',
    ImageTags: { Primary: 'tag' },
    SeriesPrimaryImageTag: 'stag',
    ParentPrimaryImageItemId: 'a846ff2cf5a4d89d6d0e6593d2475cab',
  };

  it('requests the newest items of one type with the API key and maps the fields', async () => {
    const fetchFn = vi.fn(async () => res({ Items: [RAW_EPISODE_ORPHAN, RAW_EPISODE], TotalRecordCount: 2 })) as unknown as typeof fetch;
    const items = await getRecentItems(CFG, 'Episode', 50, fetchFn);
    const url = calls(fetchFn)[0][0];
    expect(url).toContain('http://jellyfin.local:8096/Items?');
    expect(url).toContain('includeItemTypes=Episode');
    expect(url).toContain('recursive=true');
    expect(url).toContain('sortBy=DateCreated');
    expect(url).toContain('sortOrder=Descending');
    expect(url).toContain('limit=50');
    expect(url).toContain('fields=DateCreated');
    expect(items[0]).toMatchObject({
      id: 'e88b8620b06e4462ece7eb2dd20157c1',
      seriesName: null,
      seriesId: null,
      hasPrimaryImage: false,
      parentPrimaryImageItemId: 'f2b38fba124afa939639eed2cb1f8e4d',
    });
    expect(items[1]).toMatchObject({
      name: "A New New York Yankee in King Elfo's Court",
      type: 'Episode',
      serverId: 'srv',
      dateCreated: '2026-09-21T09:13:21.3359525Z',
      productionYear: 2026,
      seriesName: 'Futurama',
      seriesId: 'eb8e30f47579210b3576e393001074c5',
      seasonId: 'a846ff2cf5a4d89d6d0e6593d2475cab',
      hasPrimaryImage: true,
      hasSeriesPrimaryImage: true,
    });
  });
});

describe('searchItems', () => {
  it('searches movies and series with the term encoded', async () => {
    const fetchFn = vi.fn(async () =>
      res({ Items: [{ Id: 'eb8e30f47579210b3576e393001074c5', Name: 'Futurama', Type: 'Series', ProductionYear: 1999, ImageTags: { Primary: 't' } }] })
    ) as unknown as typeof fetch;
    const items = await searchItems(CFG, 'fu tu', 10, fetchFn);
    const url = calls(fetchFn)[0][0];
    expect(url).toContain('searchTerm=fu%20tu');
    expect(url).toContain('includeItemTypes=Movie,Series');
    expect(url).toContain('recursive=true');
    expect(url).toContain('limit=10');
    expect(items[0]).toMatchObject({ name: 'Futurama', type: 'Series', productionYear: 1999, hasPrimaryImage: true });
  });
});

describe('poster helpers', () => {
  it('round-trips a valid ref and rejects malformed ones', () => {
    expect(jellyfinPosterRef(ID)).toBe(`jellyfin:${ID}`);
    expect(parseJellyfinPosterRef(`jellyfin:${ID}`)).toBe(ID);
    expect(parseJellyfinPosterRef('jellyfin:1a2b3c4d-5e6f-47a8-b9c0-d1e2f3a4b5c6')).toBe(
      '1a2b3c4d-5e6f-47a8-b9c0-d1e2f3a4b5c6'
    );
    expect(parseJellyfinPosterRef('jellyfin:../../etc/passwd')).toBeNull();
    expect(parseJellyfinPosterRef('jellyfin:abc')).toBeNull();
    expect(parseJellyfinPosterRef('/library/metadata/1/thumb/1')).toBeNull();
    expect(parseJellyfinPosterRef('')).toBeNull();
  });

  it('fetchJellyfinPoster requests the resized primary image with the token header', async () => {
    const fetchFn = vi.fn(
      async () => new Response(new Uint8Array([9, 8]), { status: 200, headers: { 'Content-Type': 'image/jpeg' } })
    ) as unknown as typeof fetch;
    const result = await fetchJellyfinPoster(CFG, ID, fetchFn);
    expect(result?.contentType).toBe('image/jpeg');
    expect(Array.from(new Uint8Array(result!.bytes))).toEqual([9, 8]);
    const [url, init] = calls(fetchFn)[0];
    expect(url).toBe(`http://jellyfin.local:8096/Items/${ID}/Images/Primary?maxWidth=300&maxHeight=450&quality=90`);
    expect((init.headers as Record<string, string>).Authorization).toContain('Token="key123"');
  });

  it('fetchJellyfinPoster returns null for an invalid id (no fetch) and for an upstream failure', async () => {
    const fetchFn = vi.fn(async () => new Response('bad', { status: 400 })) as unknown as typeof fetch;
    expect(await fetchJellyfinPoster(CFG, '../x', fetchFn)).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
    expect(await fetchJellyfinPoster(CFG, ID, fetchFn)).toBeNull();
  });
});

describe('jellyfinWebUrl', () => {
  it('builds the web client details link, with the server id when known', () => {
    expect(jellyfinWebUrl('http://j.local:8096', ID, 'srv1')).toBe(
      `http://j.local:8096/web/index.html#/details?id=${ID}&serverId=srv1`
    );
    expect(jellyfinWebUrl('http://j.local:8096', ID, null)).toBe(`http://j.local:8096/web/index.html#/details?id=${ID}`);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/lib/media/jellyfin.test.ts`
Expected: FAIL (module `jellyfin` does not exist).

- [ ] **Step 3: Implement `src/lib/media/jellyfin.ts`**

```ts
import { timeoutSignal } from '../fetch-timeout';
import type { PosterResult } from './types';

// Structural on purpose: this module is reachable from the Edge middleware
// (through media/membership.ts) and must never import config.ts.
export interface JellyfinProviderConfig {
  url: string;
  apiKey: string;
}

export interface JellyfinUser {
  id: string;
  name: string;
  isAdministrator: boolean;
  isDisabled: boolean;
}

export interface JellyfinItem {
  id: string;
  name: string;
  type: string;
  serverId: string | null;
  dateCreated: string | null;
  productionYear: number | null;
  seriesName: string | null;
  seriesId: string | null;
  seasonId: string | null;
  hasPrimaryImage: boolean;
  parentPrimaryImageItemId: string | null;
  hasSeriesPrimaryImage: boolean;
}

export type JellyfinAuthResult =
  | { status: 'denied' }
  | { status: 'ok'; user: JellyfinUser; accessToken: string };

interface RawUser {
  Id: string;
  Name?: string;
  Policy?: { IsAdministrator?: boolean; IsDisabled?: boolean };
}

interface RawItem {
  Id: string;
  Name?: string;
  Type?: string;
  ServerId?: string;
  DateCreated?: string;
  ProductionYear?: number;
  SeriesName?: string;
  SeriesId?: string;
  SeasonId?: string;
  ImageTags?: Record<string, string>;
  ParentPrimaryImageItemId?: string;
  SeriesPrimaryImageTag?: string;
}

// Verified against Jellyfin 12.1.0: every call must carry this Authorization
// header. The legacy X-Emby-Token / X-MediaBrowser-Token headers and ?api_key=
// are rejected with 401, so they must not be used.
const CLIENT_INFO = 'Client="Portarr", Device="Portarr", DeviceId="portarr", Version="1"';

/** Header for calls made on behalf of no token yet (AuthenticateByName). */
export function jellyfinClientAuth(): string {
  return `MediaBrowser ${CLIENT_INFO}`;
}

/** Header for API-key calls, and for calls made with a user's access token. */
export function jellyfinTokenAuth(token: string): string {
  // Quotes and line breaks would break out of the header value.
  return `MediaBrowser ${CLIENT_INFO}, Token="${token.replace(/["\r\n]/g, '')}"`;
}

function normalizeUser(raw: RawUser): JellyfinUser {
  return {
    id: raw.Id,
    name: raw.Name ?? '',
    isAdministrator: raw.Policy?.IsAdministrator === true,
    isDisabled: raw.Policy?.IsDisabled === true,
  };
}

function normalizeItem(raw: RawItem): JellyfinItem {
  return {
    id: raw.Id,
    name: raw.Name ?? '',
    type: raw.Type ?? '',
    serverId: raw.ServerId ?? null,
    dateCreated: raw.DateCreated ?? null,
    productionYear: raw.ProductionYear ?? null,
    seriesName: raw.SeriesName ?? null,
    seriesId: raw.SeriesId ?? null,
    seasonId: raw.SeasonId ?? null,
    hasPrimaryImage: Boolean(raw.ImageTags?.Primary),
    parentPrimaryImageItemId: raw.ParentPrimaryImageItemId ?? null,
    hasSeriesPrimaryImage: Boolean(raw.SeriesPrimaryImageTag),
  };
}

async function jfGet<T>(cfg: JellyfinProviderConfig, path: string, fetchFn: typeof fetch): Promise<T> {
  const res = await fetchFn(`${cfg.url}${path}`, {
    headers: { Authorization: jellyfinTokenAuth(cfg.apiKey), Accept: 'application/json' },
    signal: timeoutSignal(),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Jellyfin API request failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export async function listUsers(cfg: JellyfinProviderConfig, fetchFn: typeof fetch = fetch): Promise<JellyfinUser[]> {
  const raw = await jfGet<RawUser[]>(cfg, '/Users', fetchFn);
  return raw.map(normalizeUser);
}

// The password only ever appears in this request body. Errors carry the HTTP
// status and nothing from the request or the response body.
export async function authenticateByName(
  cfg: JellyfinProviderConfig,
  username: string,
  password: string,
  fetchFn: typeof fetch = fetch
): Promise<JellyfinAuthResult> {
  const res = await fetchFn(`${cfg.url}/Users/AuthenticateByName`, {
    method: 'POST',
    headers: {
      Authorization: jellyfinClientAuth(),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ Username: username, Pw: password }),
    signal: timeoutSignal(),
    cache: 'no-store',
  });
  if (res.status === 401) {
    return { status: 'denied' };
  }
  if (!res.ok) {
    throw new Error(`Jellyfin authentication request failed: ${res.status}`);
  }
  const data = (await res.json()) as { User?: RawUser; AccessToken?: string };
  if (!data.User?.Id || !data.AccessToken) {
    throw new Error('Jellyfin authentication response was missing the user or the access token');
  }
  return { status: 'ok', user: normalizeUser(data.User), accessToken: data.AccessToken };
}

// Ends the session created by AuthenticateByName so Portarr leaves none behind.
export async function logoutSession(
  cfg: JellyfinProviderConfig,
  accessToken: string,
  fetchFn: typeof fetch = fetch
): Promise<void> {
  const res = await fetchFn(`${cfg.url}/Sessions/Logout`, {
    method: 'POST',
    headers: { Authorization: jellyfinTokenAuth(accessToken) },
    signal: timeoutSignal(),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Jellyfin session logout failed: ${res.status}`);
  }
}

export async function getRecentItems(
  cfg: JellyfinProviderConfig,
  type: 'Movie' | 'Episode',
  limit: number,
  fetchFn: typeof fetch = fetch
): Promise<JellyfinItem[]> {
  const data = await jfGet<{ Items?: RawItem[] }>(
    cfg,
    `/Items?includeItemTypes=${type}&recursive=true&sortBy=DateCreated&sortOrder=Descending&limit=${limit}&fields=DateCreated`,
    fetchFn
  );
  return (data.Items ?? []).map(normalizeItem);
}

export async function searchItems(
  cfg: JellyfinProviderConfig,
  query: string,
  limit: number,
  fetchFn: typeof fetch = fetch
): Promise<JellyfinItem[]> {
  const data = await jfGet<{ Items?: RawItem[] }>(
    cfg,
    `/Items?searchTerm=${encodeURIComponent(query)}&includeItemTypes=Movie,Series&recursive=true&limit=${limit}&fields=ProductionYear`,
    fetchFn
  );
  return (data.Items ?? []).map(normalizeItem);
}

// Item ids are 32 hex chars (36 with dashes); anything else never reaches the
// network, so a crafted poster ref cannot steer the request path.
const JELLYFIN_ID = /^[0-9a-fA-F-]{32,36}$/;
const POSTER_PREFIX = 'jellyfin:';

export function jellyfinPosterRef(itemId: string): string {
  return `${POSTER_PREFIX}${itemId}`;
}

export function parseJellyfinPosterRef(ref: string): string | null {
  if (!ref.startsWith(POSTER_PREFIX)) return null;
  const id = ref.slice(POSTER_PREFIX.length);
  return JELLYFIN_ID.test(id) ? id : null;
}

export async function fetchJellyfinPoster(
  cfg: JellyfinProviderConfig,
  itemId: string,
  fetchFn: typeof fetch = fetch
): Promise<PosterResult | null> {
  if (!JELLYFIN_ID.test(itemId)) return null;
  const res = await fetchFn(`${cfg.url}/Items/${itemId}/Images/Primary?maxWidth=300&maxHeight=450&quality=90`, {
    headers: { Authorization: jellyfinTokenAuth(cfg.apiKey) },
    signal: timeoutSignal(),
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return { bytes: await res.arrayBuffer(), contentType: res.headers.get('content-type') ?? 'image/jpeg' };
}

// Deep link into the Jellyfin web client (route format confirmed in the served
// bundle: `#/details?id=`).
export function jellyfinWebUrl(baseUrl: string, itemId: string, serverId: string | null): string {
  const server = serverId ? `&serverId=${serverId}` : '';
  return `${baseUrl}/web/index.html#/details?id=${itemId}${server}`;
}
```

- [ ] **Step 4: Run to verify it passes, then the whole suite**

```bash
npx vitest run tests/lib/media/jellyfin.test.ts 2>&1 | tail -15
npm run typecheck 2>&1 | tail -10
npx vitest run tests/middleware-edge-imports.test.ts 2>&1 | tail -5
npx vitest run 2>&1 | tail -10
```

Expected: the new tests PASS; typecheck clean; the Edge guard still passes (nothing imports `jellyfin.ts` yet); whole suite green except the pre-existing `dashboard-stats` failure.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add low-level Jellyfin API module" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Jellyfin configuration (schema, config, connection test, wizard step, settings panel, docs)

**Files:**
- Modify: `src/lib/settings-schema.ts`, `src/lib/config.ts`, `src/lib/connection-test.ts`, `src/lib/setup-steps.ts`
- Modify: `src/components/SetupWizard.tsx`, `src/components/ServiceSettingsForm.tsx`, `src/components/AdminSettingsPanel.tsx`
- Modify: `.env.example`, `README.md`
- Test: `tests/lib/settings-schema.test.ts`, `tests/lib/connection-test.test.ts`, `tests/lib/setup-steps.test.ts`, `tests/lib/config.test.ts`

**Interfaces:**
- Consumes: `jellyfinTokenAuth`, `JellyfinProviderConfig` from `src/lib/media/jellyfin.ts` (Task 2).
- Produces: `ServiceKey` includes `'jellyfin'`; `SERVICE_FIELDS.jellyfin = [JELLYFIN_URL (text), JELLYFIN_API_KEY (password)]`; `JellyfinConfig { url: string; apiKey: string }` and `AppConfig.jellyfin: JellyfinConfig | null` (URL without trailing slash); `testJellyfinConnection(url, apiKey, fetchFn?): Promise<ConnectionTestResult>`.

- [ ] **Step 1: Write the failing tests**

`tests/lib/settings-schema.test.ts`: change the first test to

```ts
  it('covers exactly the 8 configurable groups', () => {
    expect(Object.keys(SERVICE_FIELDS).sort()).toEqual(
      ['jellyfin', 'overseerr', 'plex', 'publicBaseUrl', 'radarr', 'smtp', 'sonarr', 'tautulli'].sort()
    );
  });

  it('jellyfin needs a url (text) and an api key (password)', () => {
    expect(SERVICE_FIELDS.jellyfin.map((f) => [f.envKey, f.type])).toEqual([
      ['JELLYFIN_URL', 'text'],
      ['JELLYFIN_API_KEY', 'password'],
    ]);
  });
```

Append to `tests/lib/connection-test.test.ts` (add `testJellyfinConnection` to its import from `../../src/lib/connection-test`):

```ts
describe('testJellyfinConnection', () => {
  it('succeeds when /System/Info returns a server id, sending the token header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ Id: 'abc', ServerName: 'MyJellyfin' }));
    const result = await testJellyfinConnection('http://jellyfin.local:8096/', 'key123', fetchMock);
    expect(result).toEqual({ ok: true, error: null });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://jellyfin.local:8096/System/Info');
    expect(init.headers.Authorization).toContain('Token="key123"');
  });

  it('fails with the status code when Jellyfin rejects the key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, false, 401));
    const result = await testJellyfinConnection('http://jellyfin.local:8096', 'bad', fetchMock);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('401');
  });

  it('fails on a response without a server id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ hello: 'world' }));
    const result = await testJellyfinConnection('http://jellyfin.local:8096', 'k', fetchMock);
    expect(result.ok).toBe(false);
  });

  it('reports a network error', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED'));
    const result = await testJellyfinConnection('http://jellyfin.local:8096', 'k', fetchMock);
    expect(result).toEqual({ ok: false, error: 'connect ECONNREFUSED' });
  });
});
```

Append to `tests/lib/setup-steps.test.ts` inside `describe('applyServiceSettings', ...)`:

```ts
  it('tests and persists the jellyfin step (url and key) on success', async () => {
    const db = getDb(':memory:');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ Id: 'srv' }));
    const result = await applyServiceSettings(
      db,
      'jellyfin',
      { JELLYFIN_URL: 'http://jellyfin.local:8096', JELLYFIN_API_KEY: 'key123' },
      { NODE_ENV: 'test' as const },
      fetchMock
    );
    expect(result).toEqual({ ok: true, error: null });
    expect(getSetting(db, 'JELLYFIN_URL')).toBe('http://jellyfin.local:8096');
    expect(getSetting(db, 'JELLYFIN_API_KEY')).toBe('key123');
  });

  it('does not persist the jellyfin step when the connection test fails', async () => {
    const db = getDb(':memory:');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, false, 401));
    const result = await applyServiceSettings(
      db,
      'jellyfin',
      { JELLYFIN_URL: 'http://jellyfin.local:8096', JELLYFIN_API_KEY: 'bad' },
      { NODE_ENV: 'test' as const },
      fetchMock
    );
    expect(result.ok).toBe(false);
    expect(getSetting(db, 'JELLYFIN_URL')).toBeNull();
  });
```

Append to `tests/lib/config.test.ts`:

```ts
describe('jellyfin config', () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it('is null when JELLYFIN_URL or JELLYFIN_API_KEY is missing', () => {
    expect(loadConfig(FULL_ENV, getDb(':memory:')).jellyfin).toBeNull();
    resetDbForTests();
    expect(loadConfig({ ...FULL_ENV, JELLYFIN_URL: 'http://j.local:8096' }, getDb(':memory:')).jellyfin).toBeNull();
  });

  it('is loaded from env with the trailing slash trimmed', () => {
    const config = loadConfig(
      { ...FULL_ENV, JELLYFIN_URL: 'http://j.local:8096/', JELLYFIN_API_KEY: 'key123' },
      getDb(':memory:')
    );
    expect(config.jellyfin).toEqual({ url: 'http://j.local:8096', apiKey: 'key123' });
  });

  it('never changes isSetupComplete (Jellyfin is optional)', () => {
    const withJellyfin = loadConfig(
      { ...FULL_ENV, JELLYFIN_URL: 'http://j.local:8096', JELLYFIN_API_KEY: 'key123' },
      getDb(':memory:')
    );
    expect(isSetupComplete(withJellyfin)).toBe(true);
    resetDbForTests();
    expect(isSetupComplete(loadConfig(FULL_ENV, getDb(':memory:')))).toBe(true);
  });

  it('reports the source of the jellyfin keys', () => {
    const db = getDb(':memory:');
    const sources = getConfigSources({ ...FULL_ENV, JELLYFIN_URL: 'http://j.local:8096' }, db);
    expect(sources.JELLYFIN_URL).toBe('env');
    expect(sources.JELLYFIN_API_KEY).toBe('unset');
  });
});
```

(`tests/lib/config.test.ts` already imports `beforeEach`, `getDb`, `resetDbForTests`, `loadConfig`, `isSetupComplete`, `getConfigSources`.)

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/lib/settings-schema.test.ts tests/lib/connection-test.test.ts tests/lib/setup-steps.test.ts tests/lib/config.test.ts`
Expected: FAIL (`jellyfin` service, `testJellyfinConnection` and `config.jellyfin` do not exist).

- [ ] **Step 3: Schema and config**

`src/lib/settings-schema.ts`: add `| 'jellyfin'` to `ServiceKey` (after `'tautulli'`) and, in `SERVICE_FIELDS`, after the `tautulli` entry:

```ts
  jellyfin: [
    { envKey: 'JELLYFIN_URL', label: 'URL du serveur Jellyfin', type: 'text' },
    { envKey: 'JELLYFIN_API_KEY', label: 'Clé API Jellyfin (Tableau de bord > Clés API)', type: 'password' },
  ],
```

`src/lib/config.ts`:
- after `TautulliConfig` add `export interface JellyfinConfig { url: string; apiKey: string; }`
- in `AppConfig` add `jellyfin: JellyfinConfig | null;` after `tautulli`
- in `loadConfig`, after the `tautulli` block:

```ts
  const jellyfinUrl = v('JELLYFIN_URL');
  const jellyfinApiKey = v('JELLYFIN_API_KEY');
  // A trailing slash would produce `//System/Info` style URLs.
  const jellyfin: JellyfinConfig | null =
    jellyfinUrl && jellyfinApiKey ? { url: jellyfinUrl.replace(/\/+$/, ''), apiKey: jellyfinApiKey } : null;
```
  and add `jellyfin,` after `tautulli,` in the returned object
- add `'JELLYFIN_URL', 'JELLYFIN_API_KEY',` after `'TAUTULLI_API_KEY',` in `CONFIGURABLE_KEYS`.

- [ ] **Step 4: Connection test and setup step**

`src/lib/connection-test.ts`: add `import { jellyfinTokenAuth } from './media/jellyfin';` and, after `testTautulliConnection`:

```ts
export async function testJellyfinConnection(
  url: string,
  apiKey: string,
  fetchFn: typeof fetch = fetch
): Promise<ConnectionTestResult> {
  try {
    const res = await fetchFn(`${url.replace(/\/+$/, '')}/System/Info`, {
      headers: { Authorization: jellyfinTokenAuth(apiKey), Accept: 'application/json' },
      signal: timeoutSignal(),
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false, error: `Jellyfin a répondu ${res.status} ${res.statusText}` };
    const data = (await res.json()) as { Id?: string };
    if (!data.Id) {
      return { ok: false, error: "Réponse Jellyfin inattendue (pas d'identifiant serveur)" };
    }
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: messageFromError(err) };
  }
}
```

`src/lib/setup-steps.ts`: add `testJellyfinConnection` to the import from `./connection-test` and this case after `'tautulli'`:

```ts
    case 'jellyfin':
      return testJellyfinConnection(resolved.JELLYFIN_URL, resolved.JELLYFIN_API_KEY, fetchFn);
```

- [ ] **Step 5: Wizard (optional step), settings form, admin panel**

`src/components/ServiceSettingsForm.tsx`: add to `ServiceSettingsFormProps`

```ts
  // When set, a "Passer cette étape" button appears next to submit — for an
  // optional service (Jellyfin) whose step can be skipped without saving anything.
  onSkip?: () => void;
```
destructure `onSkip` in the component's parameters and replace the trailing submit `<button ...>...</button>` (the last element inside the `<form>`) with:

```tsx
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-plexcrew-teal px-4 py-2 text-sm font-semibold text-plexcrew-ink disabled:opacity-50"
        >
          {submitting ? (testable ? 'Test en cours…' : 'Enregistrement…') : testable ? 'Tester et enregistrer' : 'Enregistrer'}
        </button>
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            disabled={submitting}
            className="rounded-full border border-plexcrew-teal/30 px-4 py-2 text-sm font-medium text-plexcrew-screen disabled:opacity-50"
          >
            Passer cette étape
          </button>
        )}
      </div>
```

`src/components/SetupWizard.tsx`: `STEPS` becomes `['publicBaseUrl', 'plex', 'tautulli', 'jellyfin', 'sonarr', 'radarr', 'overseerr', 'smtp']`; add `jellyfin: 'Jellyfin (optionnel)',` to `STEP_TITLES`; and pass to `<ServiceSettingsForm ...>` the prop

```tsx
        onSkip={step === 'jellyfin' ? () => setStepIndex(stepIndex + 1) : undefined}
```
(the wizard's completion still fires on the last step, `smtp`, so a skipped Jellyfin step needs nothing else).

`src/components/AdminSettingsPanel.tsx`: add `jellyfin: 'Jellyfin',` to `SERVICE_TITLES` and `'jellyfin'` after `'tautulli'` in `SERVICES`.

- [ ] **Step 6: Docs**

`.env.example`: after the two `TAUTULLI_*` lines add

```
# Jellyfin (optional, runs alongside Plex + Tautulli). Create the API key in the Jellyfin dashboard > API Keys.
# JELLYFIN_URL=http://jellyfin.example.com:8096
# JELLYFIN_API_KEY=replace-with-jellyfin-api-key
```

`README.md`, after the `TAUTULLI_URL` row of each of the two tables:
- French (config table): ``| `JELLYFIN_URL`, `JELLYFIN_API_KEY` | assistant ou env (optionnel) | Connexion Jellyfin (identifiant + mot de passe), récemment ajoutés, recherche, membres |``
- English (config table): ``| `JELLYFIN_URL`, `JELLYFIN_API_KEY` | wizard or env (optional) | Jellyfin login (username + password), recently added, search, members |``

- [ ] **Step 7: Verify and commit**

```bash
npx vitest run tests/lib/settings-schema.test.ts tests/lib/connection-test.test.ts tests/lib/setup-steps.test.ts tests/lib/config.test.ts 2>&1 | tail -15
npm run typecheck 2>&1 | tail -15
npx vitest run 2>&1 | tail -10
```

Expected: the new tests PASS; typecheck clean (any `Record<ServiceKey, ...>` that still lacks a `jellyfin` entry is a compile error: add it); whole suite green except the pre-existing failure.

```bash
git add -A
git commit -m "feat: add Jellyfin configuration (schema, connection test, optional wizard step, settings panel)" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Jellyfin provider, registry activation and session revalidation

**Files:**
- Create: `src/lib/media/jellyfin-provider.ts`
- Modify: `src/lib/media/registry.ts`, `src/lib/media/membership.ts`
- Test: `tests/lib/media/jellyfin-provider.test.ts`; additions to `tests/lib/media/registry.test.ts`, `tests/lib/media/membership.test.ts`

**Interfaces:**
- Consumes: everything exported by `src/lib/media/jellyfin.ts` (Task 2); `PasswordAuth`, `MediaServer` (Task 1); `SESSION_REVALIDATION_TTL_MS` from `./plex`; `withTtlCache`, `DEFAULT_CACHE_TTL_MS` from `../ttl-cache`.
- Produces: `createJellyfinProvider(cfg: JellyfinProviderConfig, fetchFn?): MediaServer`; `ProviderConfigSource.jellyfin?: JellyfinProviderConfig | null`; `getActiveProviders` includes Jellyfin whenever `config.jellyfin` is set; `isStillMember` handles `provider: 'jellyfin'`.

- [ ] **Step 1: Write the failing tests**

`tests/lib/media/jellyfin-provider.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createJellyfinProvider } from '../../../src/lib/media/jellyfin-provider';
import { resetTtlCacheForTests } from '../../../src/lib/ttl-cache';

const CFG = { url: 'http://jellyfin.local:8096', apiKey: 'key123' };
const UID = '1a2b3c4d5e6f47a8b9c0d1e2f3a4b5c6';

beforeEach(() => {
  resetTtlCacheForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function res(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: async () => body,
    headers: new Headers(),
    arrayBuffer: async () => new ArrayBuffer(0),
  } as unknown as Response;
}

function stub(routes: Record<string, () => Response>): typeof fetch {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    const hit = Object.keys(routes).find((fragment) => url.includes(fragment));
    if (!hit) throw new Error(`unexpected fetch: ${url}`);
    return routes[hit]();
  }) as unknown as typeof fetch;
}

const urls = (fetchFn: typeof fetch) =>
  (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));

const USERS = [
  { Id: UID, Name: 'alice', Policy: { IsAdministrator: true, IsDisabled: false, IsHidden: true } },
  { Id: 'c'.repeat(32), Name: 'guest', Policy: { IsAdministrator: false, IsDisabled: false } },
  { Id: 'd'.repeat(32), Name: 'gone', Policy: { IsAdministrator: false, IsDisabled: true } },
];

describe('createJellyfinProvider: identity and members', () => {
  it('identifies itself as the jellyfin password provider', () => {
    const p = createJellyfinProvider(CFG, stub({}));
    expect(p.id).toBe('jellyfin');
    expect(p.displayName).toBe('Jellyfin');
    expect(p.auth.kind).toBe('password');
  });

  it('listMembers returns enabled users (hidden ones included) with an empty email', async () => {
    const p = createJellyfinProvider(CFG, stub({ '/Users': () => res(USERS) }));
    expect(await p.listMembers()).toEqual([
      { provider: 'jellyfin', userId: UID, email: '', username: 'alice' },
      { provider: 'jellyfin', userId: 'c'.repeat(32), email: '', username: 'guest' },
    ]);
  });

  it('isMember is true for an enabled user (dashes and case ignored), false for disabled or unknown', async () => {
    const p = createJellyfinProvider(CFG, stub({ '/Users': () => res(USERS) }));
    expect(await p.isMember(UID)).toBe(true);
    expect(await p.isMember('1A2B3C4D-5E6F-47A8-B9C0-D1E2F3A4B5C6')).toBe(true);
    expect(await p.isMember('d'.repeat(32))).toBe(false);
    expect(await p.isMember('e'.repeat(32))).toBe(false);
  });

  it('isMember fails open when Jellyfin is unreachable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const failing = vi.fn(async () => {
      throw new Error('down');
    }) as unknown as typeof fetch;
    expect(await createJellyfinProvider(CFG, failing).isMember(UID)).toBe(true);
  });
});

describe('createJellyfinProvider: password auth', () => {
  const OK_BODY = {
    User: { Id: UID, Name: 'alice', Policy: { IsAdministrator: true, IsDisabled: false } },
    AccessToken: 'usertoken',
  };

  it('returns the member and admin flag, then ends the temporary Jellyfin session', async () => {
    const fetchFn = stub({
      '/Users/AuthenticateByName': () => res(OK_BODY),
      '/Sessions/Logout': () => res(null, 204),
    });
    const auth = createJellyfinProvider(CFG, fetchFn).auth;
    if (auth.kind !== 'password') throw new Error('expected password auth');
    expect(await auth.authenticate('alice', 's3cret')).toEqual({
      status: 'ok',
      user: { provider: 'jellyfin', userId: UID, email: '', username: 'alice' },
      isOwner: true,
    });
    const calls = urls(fetchFn);
    expect(calls[0]).toContain('/Users/AuthenticateByName');
    expect(calls[1]).toContain('/Sessions/Logout');
  });

  it('is denied on 401 and does not try to log out', async () => {
    const fetchFn = stub({ '/Users/AuthenticateByName': () => res('nope', 401) });
    const auth = createJellyfinProvider(CFG, fetchFn).auth;
    if (auth.kind !== 'password') throw new Error('expected password auth');
    expect(await auth.authenticate('x', 'y')).toEqual({ status: 'denied' });
    expect(urls(fetchFn)).toHaveLength(1);
  });

  it('is denied for a disabled account', async () => {
    const fetchFn = stub({
      '/Users/AuthenticateByName': () =>
        res({ User: { Id: UID, Name: 'alice', Policy: { IsAdministrator: false, IsDisabled: true } }, AccessToken: 't' }),
      '/Sessions/Logout': () => res(null, 204),
    });
    const auth = createJellyfinProvider(CFG, fetchFn).auth;
    if (auth.kind !== 'password') throw new Error('expected password auth');
    expect(await auth.authenticate('alice', 'pw')).toEqual({ status: 'denied' });
  });

  it('still succeeds when the temporary session cannot be ended', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchFn = stub({
      '/Users/AuthenticateByName': () => res(OK_BODY),
      '/Sessions/Logout': () => res({}, 500),
    });
    const auth = createJellyfinProvider(CFG, fetchFn).auth;
    if (auth.kind !== 'password') throw new Error('expected password auth');
    expect((await auth.authenticate('alice', 'pw')).status).toBe('ok');
    expect(errorSpy).toHaveBeenCalled();
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('usertoken');
  });
});

describe('createJellyfinProvider: library', () => {
  const MOVIE_NEW = { Id: 'a'.repeat(32), Name: 'The Way', Type: 'Movie', ServerId: 'srv', DateCreated: '2026-09-18T13:47:40.8231662Z', ProductionYear: 2010, ImageTags: { Primary: 't' } };
  const MOVIE_NO_POSTER = { Id: 'b'.repeat(32), Name: 'Plain', Type: 'Movie', ServerId: 'srv', DateCreated: '2026-09-15T09:07:19Z', ImageTags: {} };
  const EP_A2 = { Id: '1'.repeat(32), Name: 'E2', Type: 'Episode', ServerId: 'srv', DateCreated: '2026-09-21T09:00:00Z', SeriesName: 'Futurama', SeriesId: 'f'.repeat(32), SeasonId: 'e'.repeat(32), ImageTags: { Primary: 't' }, SeriesPrimaryImageTag: 's', ParentPrimaryImageItemId: 'e'.repeat(32) };
  const EP_A1 = { ...EP_A2, Id: '2'.repeat(32), Name: 'E1', DateCreated: '2026-09-20T09:00:00Z' };
  const EP_ORPHAN = { Id: '3'.repeat(32), Name: 'Has Fallen - S02E03', Type: 'Episode', ServerId: 'srv', DateCreated: '2026-09-19T09:00:00Z', ImageTags: {}, ParentPrimaryImageItemId: 'd'.repeat(32) };

  function library() {
    return stub({
      'includeItemTypes=Movie&': () => res({ Items: [MOVIE_NEW, MOVIE_NO_POSTER] }),
      'includeItemTypes=Episode': () => res({ Items: [EP_A2, EP_A1, EP_ORPHAN] }),
    });
  }

  it('recentlyAddedSplit maps movies and collapses episodes to one entry per series', async () => {
    const split = await createJellyfinProvider(CFG, library()).recentlyAddedSplit(15);
    expect(split.movies).toEqual([
      {
        title: 'The Way',
        thumbPath: `jellyfin:${'a'.repeat(32)}`,
        addedAt: '2026-09-18T13:47:40.8231662Z',
        type: 'movie',
        webUrl: `http://jellyfin.local:8096/web/index.html#/details?id=${'a'.repeat(32)}&serverId=srv`,
      },
      {
        title: 'Plain',
        thumbPath: '',
        addedAt: '2026-09-15T09:07:19Z',
        type: 'movie',
        webUrl: `http://jellyfin.local:8096/web/index.html#/details?id=${'b'.repeat(32)}&serverId=srv`,
      },
    ]);
    expect(split.episodes.map((e) => e.title)).toEqual(['Futurama', 'Has Fallen - S02E03']);
    // One Futurama entry (the newest), poster = the season image, link = the season.
    expect(split.episodes[0]).toMatchObject({
      type: 'episode',
      addedAt: '2026-09-21T09:00:00Z',
      thumbPath: `jellyfin:${'e'.repeat(32)}`,
      webUrl: `http://jellyfin.local:8096/web/index.html#/details?id=${'e'.repeat(32)}&serverId=srv`,
    });
    // An episode with no series info falls back to its name and its parent's image.
    expect(split.episodes[1]).toMatchObject({ thumbPath: `jellyfin:${'d'.repeat(32)}` });
  });

  it('recentlyAddedSplit asks for a generous raw batch per type and slices to the requested count', async () => {
    const fetchFn = library();
    const split = await createJellyfinProvider(CFG, fetchFn).recentlyAddedSplit(1);
    expect(split.movies).toHaveLength(1);
    expect(split.episodes).toHaveLength(1);
    expect(urls(fetchFn).some((u) => u.includes('limit=50'))).toBe(true);
  });

  it('recentlyAdded merges both types, newest first, and slices', async () => {
    const items = await createJellyfinProvider(CFG, library()).recentlyAdded(2);
    expect(items.map((i) => i.title)).toEqual(['Futurama', 'Has Fallen - S02E03']);
  });

  it('search maps movies and series and returns [] for an empty query without fetching', async () => {
    const fetchFn = stub({
      '/Items?searchTerm=': () =>
        res({
          Items: [
            { Id: 'f'.repeat(32), Name: 'Futurama', Type: 'Series', ServerId: 'srv', ProductionYear: 1999, ImageTags: { Primary: 't' } },
            { Id: 'a'.repeat(32), Name: 'Future World', Type: 'Movie', ServerId: 'srv', ProductionYear: 2018, ImageTags: {} },
          ],
        }),
    });
    const p = createJellyfinProvider(CFG, fetchFn);
    expect(await p.search('   ')).toEqual([]);
    expect(urls(fetchFn)).toHaveLength(0);
    expect(await p.search('futu')).toEqual([
      {
        title: 'Futurama',
        year: 1999,
        type: 'show',
        thumbPath: `jellyfin:${'f'.repeat(32)}`,
        webUrl: `http://jellyfin.local:8096/web/index.html#/details?id=${'f'.repeat(32)}&serverId=srv`,
      },
      {
        title: 'Future World',
        year: 2018,
        type: 'movie',
        thumbPath: null,
        webUrl: `http://jellyfin.local:8096/web/index.html#/details?id=${'a'.repeat(32)}&serverId=srv`,
      },
    ]);
  });
});

describe('createJellyfinProvider: posters', () => {
  it('handles only valid jellyfin refs', () => {
    const p = createJellyfinProvider(CFG, stub({}));
    expect(p.handlesPoster(`jellyfin:${UID}`)).toBe(true);
    expect(p.handlesPoster('jellyfin:../x')).toBe(false);
    expect(p.handlesPoster('/library/metadata/1/thumb/1')).toBe(false);
  });

  it('poster fetches the resized primary image', async () => {
    const fetchFn = vi.fn(
      async () => new Response(new Uint8Array([7]), { status: 200, headers: { 'Content-Type': 'image/jpeg' } })
    ) as unknown as typeof fetch;
    const result = await createJellyfinProvider(CFG, fetchFn).poster(`jellyfin:${UID}`);
    expect(result?.contentType).toBe('image/jpeg');
    expect(urls(fetchFn)[0]).toContain(`/Items/${UID}/Images/Primary?maxWidth=300`);
  });

  it('poster returns null for a foreign ref without fetching', async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch;
    expect(await createJellyfinProvider(CFG, fetchFn).poster('/library/metadata/1/thumb/1')).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
```

Append to `tests/lib/media/registry.test.ts`:

```ts
describe('jellyfin activation', () => {
  const JELLYFIN = { url: 'http://jellyfin.local:8096', apiKey: 'k' };

  it('activates jellyfin next to plex when both are configured', () => {
    expect(getActiveProviders({ plex: PLEX, tautulli: TAUTULLI, jellyfin: JELLYFIN }).map((p) => p.id)).toEqual([
      'plex',
      'jellyfin',
    ]);
  });

  it('activates jellyfin on its own, independently of Tautulli', () => {
    expect(getActiveProviders({ plex: null, tautulli: null, jellyfin: JELLYFIN }).map((p) => p.id)).toEqual(['jellyfin']);
  });

  it('getPasswordAuth returns the jellyfin password auth, getPinAuth refuses it', () => {
    const config = { plex: PLEX, tautulli: TAUTULLI, jellyfin: JELLYFIN };
    expect(getPasswordAuth(config, 'jellyfin').kind).toBe('password');
    expect(() => getPinAuth(config, 'jellyfin')).toThrow(/does not use pin auth/);
  });
});
```

Append to `tests/lib/media/membership.test.ts` (replace the existing `'allows a jellyfin ref until the jellyfin adapter exists'` test with these):

```ts
  const JELLYFIN_ENV = { JELLYFIN_URL: 'http://jellyfin.local:8096', JELLYFIN_API_KEY: 'k' };
  const UID = '1a2b3c4d5e6f47a8b9c0d1e2f3a4b5c6';

  function jellyfinUsersFetch(): typeof fetch {
    return vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => [{ Id: UID, Name: 'alice', Policy: { IsAdministrator: false, IsDisabled: false } }],
        }) as unknown as Response
    ) as unknown as typeof fetch;
  }

  it('confirms an enabled jellyfin user and rejects an unknown one', async () => {
    expect(await isStillMember({ provider: 'jellyfin', userId: UID }, JELLYFIN_ENV, jellyfinUsersFetch())).toBe(true);
    expect(await isStillMember({ provider: 'jellyfin', userId: 'e'.repeat(32) }, JELLYFIN_ENV, jellyfinUsersFetch())).toBe(false);
  });

  it('skips revalidation (allows) when jellyfin is not configured through env', async () => {
    const fetchFn = jellyfinUsersFetch();
    expect(await isStillMember({ provider: 'jellyfin', userId: 'e'.repeat(32) }, {}, fetchFn)).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled();
  });
```

(`beforeEach(resetTtlCacheForTests)` already exists in that file, so the users cache does not leak between cases.)

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/lib/media`
Expected: FAIL (`jellyfin-provider` module and Jellyfin activation do not exist).

- [ ] **Step 3: Implement `src/lib/media/jellyfin-provider.ts`**

```ts
import { DEFAULT_CACHE_TTL_MS, withTtlCache } from '../ttl-cache';
import {
  authenticateByName,
  fetchJellyfinPoster,
  getRecentItems,
  jellyfinPosterRef,
  jellyfinWebUrl,
  listUsers,
  logoutSession,
  parseJellyfinPosterRef,
  searchItems,
  type JellyfinItem,
  type JellyfinProviderConfig,
  type JellyfinUser,
} from './jellyfin';
import { SESSION_REVALIDATION_TTL_MS } from './plex';
import type {
  MediaMember,
  MediaServer,
  RecentlyAddedItem,
  RecentlyAddedSplit,
  SearchResultItem,
} from './types';

const normalizeId = (id: string) => id.toLowerCase().replace(/-/g, '');

const toMember = (u: JellyfinUser): MediaMember => ({
  provider: 'jellyfin',
  userId: u.id,
  email: '',
  username: u.name,
});

export function createJellyfinProvider(cfg: JellyfinProviderConfig, fetchFn: typeof fetch = fetch): MediaServer {
  const link = (id: string, serverId: string | null) => jellyfinWebUrl(cfg.url, id, serverId);

  const toMovie = (item: JellyfinItem): RecentlyAddedItem | null =>
    item.dateCreated
      ? {
          title: item.name,
          thumbPath: item.hasPrimaryImage ? jellyfinPosterRef(item.id) : '',
          addedAt: item.dateCreated,
          type: 'movie',
          webUrl: link(item.id, item.serverId),
        }
      : null;

  // Episode rows show the season poster (like the Plex rows do), then the
  // series poster, then the episode's own still.
  const episodePoster = (item: JellyfinItem): string => {
    if (item.parentPrimaryImageItemId) return jellyfinPosterRef(item.parentPrimaryImageItemId);
    if (item.seriesId && item.hasSeriesPrimaryImage) return jellyfinPosterRef(item.seriesId);
    return item.hasPrimaryImage ? jellyfinPosterRef(item.id) : '';
  };

  const toEpisode = (item: JellyfinItem): RecentlyAddedItem | null =>
    item.dateCreated
      ? {
          title: item.seriesName ?? item.name,
          thumbPath: episodePoster(item),
          addedAt: item.dateCreated,
          type: 'episode',
          webUrl: link(item.seasonId ?? item.seriesId ?? item.id, item.serverId),
        }
      : null;

  // Jellyfin lists every episode on its own: a season that just landed would
  // fill the whole row. Keep only the newest episode per series, like Plex's
  // grouping of new episodes. Input is already newest-first.
  const collapseBySeries = (episodes: JellyfinItem[]): JellyfinItem[] => {
    const seen = new Set<string>();
    return episodes.filter((item) => {
      const key = item.seriesId ?? item.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const present = <T,>(value: T | null): value is T => value !== null;

  function recentlyAddedSplit(countPerType: number): Promise<RecentlyAddedSplit> {
    return withTtlCache(`jellyfin-recently-added-split:${cfg.url}:${countPerType}`, DEFAULT_CACHE_TTL_MS, async () => {
      // Two requests (like the two Plex hubs) so a burst of episodes cannot
      // starve the movies list; the raw batch leaves room for the collapsing.
      const raw = Math.max(countPerType * 3, 50);
      const [movies, episodes] = await Promise.all([
        getRecentItems(cfg, 'Movie', raw, fetchFn),
        getRecentItems(cfg, 'Episode', raw, fetchFn),
      ]);
      return {
        movies: movies.map(toMovie).filter(present).slice(0, countPerType),
        episodes: collapseBySeries(episodes).map(toEpisode).filter(present).slice(0, countPerType),
      };
    });
  }

  return {
    id: 'jellyfin',
    displayName: 'Jellyfin',
    auth: {
      kind: 'password',
      async authenticate(username, password) {
        const result = await authenticateByName(cfg, username, password, fetchFn);
        if (result.status === 'denied') return { status: 'denied' };
        // The token only proves the credentials: end that Jellyfin session
        // right away so Portarr never leaves one behind.
        try {
          await logoutSession(cfg, result.accessToken, fetchFn);
        } catch (err) {
          console.error('Failed to end the temporary Jellyfin session:', err instanceof Error ? err.message : 'unknown error');
        }
        if (result.user.isDisabled) return { status: 'denied' };
        return { status: 'ok', user: toMember(result.user), isOwner: result.user.isAdministrator };
      },
    },
    async listMembers() {
      return (await listUsers(cfg, fetchFn)).filter((u) => !u.isDisabled).map(toMember);
    },
    async isMember(userId) {
      try {
        const users = await withTtlCache(`jellyfin-users:${cfg.url}`, SESSION_REVALIDATION_TTL_MS, () =>
          listUsers(cfg, fetchFn)
        );
        return users.some((u) => !u.isDisabled && normalizeId(u.id) === normalizeId(userId));
      } catch (err) {
        console.error('Failed to re-verify Jellyfin user, allowing session through:', err);
        return true;
      }
    },
    async recentlyAdded(count) {
      const split = await recentlyAddedSplit(count);
      return [...split.movies, ...split.episodes]
        .sort((a, b) => Date.parse(b.addedAt) - Date.parse(a.addedAt))
        .slice(0, count);
    },
    recentlyAddedSplit,
    async search(query) {
      const trimmed = query.trim();
      if (!trimmed) return [];
      const items = await searchItems(cfg, trimmed, 10, fetchFn);
      return items.map(
        (item): SearchResultItem => ({
          title: item.name,
          year: item.productionYear,
          type: item.type === 'Series' ? 'show' : 'movie',
          thumbPath: item.hasPrimaryImage ? jellyfinPosterRef(item.id) : null,
          webUrl: link(item.id, item.serverId),
        })
      );
    },
    handlesPoster: (ref) => parseJellyfinPosterRef(ref) !== null,
    async poster(ref) {
      const id = parseJellyfinPosterRef(ref);
      return id ? fetchJellyfinPoster(cfg, id, fetchFn) : null;
    },
  };
}
```

- [ ] **Step 4: Registry and membership**

`src/lib/media/registry.ts`: add `import { createJellyfinProvider } from './jellyfin-provider';` and `import type { JellyfinProviderConfig } from './jellyfin';`; in `ProviderConfigSource` add `jellyfin?: JellyfinProviderConfig | null;`; in `getActiveProviders`, after the Plex `if`:

```ts
  if (config.jellyfin) {
    providers.push(createJellyfinProvider(config.jellyfin, fetchFn));
  }
```

`src/lib/media/membership.ts`: add `import { createJellyfinProvider } from './jellyfin-provider';` and replace the `case 'jellyfin':` branch (currently returning `true` with a comment) with:

```ts
    case 'jellyfin': {
      const url = env.JELLYFIN_URL;
      const apiKey = env.JELLYFIN_API_KEY;
      if (!url || !apiKey) return true;
      return createJellyfinProvider({ url: url.replace(/\/+$/, ''), apiKey }, fetchFn).isMember(ref.userId);
    }
```
Update the comment above the function: the "Fails open" paragraph now covers both providers (an install configured only through the DB/wizard has no env credentials here).

- [ ] **Step 5: Verify, including the Edge guard**

```bash
npx vitest run tests/lib/media tests/middleware-edge-imports.test.ts tests/middleware.test.ts 2>&1 | tail -20
npm run typecheck 2>&1 | tail -10
npx vitest run 2>&1 | tail -10
```

Expected: everything PASS (the Edge guard walks `membership.ts -> jellyfin-provider.ts -> jellyfin.ts` and finds no forbidden import); typecheck clean; whole suite green except the pre-existing failure.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add the Jellyfin media provider, registry activation and session revalidation" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Member emails from Seerr/Overseerr

**Files:**
- Create: `src/lib/media/seerr-emails.ts`
- Test: `tests/lib/media/seerr-emails.test.ts`

**Interfaces:**
- Consumes: `MediaMember` from `./types`; `timeoutSignal` from `../fetch-timeout`.
- Produces:
  ```ts
  interface SeerrUser {
    id: number; email: string; username: string | null; displayName: string | null;
    plexUsername: string | null; jellyfinUsername: string | null; jellyfinUserId: string | null;
  }
  fetchSeerrUsers(url: string, apiKey: string, fetchFn?: typeof fetch): Promise<SeerrUser[]>
  enrichMembersWithEmail(members: MediaMember[], seerrUsers: SeerrUser[]): MediaMember[]
  ```

- [ ] **Step 1: Write the failing tests**

`tests/lib/media/seerr-emails.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { fetchSeerrUsers, enrichMembersWithEmail, type SeerrUser } from '../../../src/lib/media/seerr-emails';
import type { MediaMember } from '../../../src/lib/media/types';

function res(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, statusText: status === 200 ? 'OK' : 'Error', json: async () => body } as unknown as Response;
}

function raw(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    email: `user${id}@example.com`,
    username: null,
    displayName: null,
    plexUsername: null,
    jellyfinUsername: null,
    jellyfinUserId: null,
    ...overrides,
  };
}

function seerr(id: number, overrides: Partial<SeerrUser> = {}): SeerrUser {
  return { id, email: `user${id}@example.com`, username: null, displayName: null, plexUsername: null, jellyfinUsername: null, jellyfinUserId: null, ...overrides };
}

const member = (userId: string, username: string, email = ''): MediaMember => ({ provider: 'jellyfin', userId, username, email });

describe('fetchSeerrUsers', () => {
  it('reads every page with the api key header and maps the fields', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(res({ pageInfo: { pages: 2, pageSize: 100, results: 101, page: 1 }, results: [raw(1, { displayName: 'Alice', plexUsername: 'Alice' })] }))
      .mockResolvedValueOnce(res({ pageInfo: { pages: 2, pageSize: 100, results: 101, page: 2 }, results: [raw(2)] })) as unknown as typeof fetch;
    const users = await fetchSeerrUsers('http://seerr.local:5055', 'seerr-key', fetchFn);
    expect(users.map((u) => u.id)).toEqual([1, 2]);
    expect(users[0]).toMatchObject({ displayName: 'Alice', plexUsername: 'Alice', jellyfinUserId: null });
    const calls = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0][0]).toBe('http://seerr.local:5055/api/v1/user?take=100&skip=0');
    expect(calls[1][0]).toBe('http://seerr.local:5055/api/v1/user?take=100&skip=100');
    expect(calls[0][1].headers['X-Api-Key']).toBe('seerr-key');
  });

  it('throws with the status when Seerr answers non-ok', async () => {
    const fetchFn = vi.fn().mockResolvedValue(res({}, 403)) as unknown as typeof fetch;
    await expect(fetchSeerrUsers('http://seerr.local:5055', 'k', fetchFn)).rejects.toThrow('403');
  });
});

describe('enrichMembersWithEmail', () => {
  it('matches by jellyfin user id (dashes and case ignored)', () => {
    const result = enrichMembersWithEmail(
      [member('1a2b3c4d5e6f47a8b9c0d1e2f3a4b5c6', 'whatever')],
      [seerr(1, { jellyfinUserId: '1A2B3C4D-5E6F-47A8-B9C0-D1E2F3A4B5C6', email: 'id@example.com' })]
    );
    expect(result[0].email).toBe('id@example.com');
  });

  it('falls back to the name, case-insensitively, across jellyfinUsername / username / displayName / plexUsername', () => {
    for (const field of ['jellyfinUsername', 'username', 'displayName', 'plexUsername'] as const) {
      const user: SeerrUser = { ...seerr(1, { email: 'name@example.com' }) };
      user[field] = 'Alice';
      const result = enrichMembersWithEmail([member('a'.repeat(32), 'alice')], [user]);
      expect(result[0].email, field).toBe('name@example.com');
    }
  });

  it('prefers the id match over a name match', () => {
    const result = enrichMembersWithEmail(
      [member('a'.repeat(32), 'alice')],
      [seerr(1, { displayName: 'alice', email: 'byname@example.com' }), seerr(2, { jellyfinUserId: 'a'.repeat(32), email: 'byid@example.com' })]
    );
    expect(result[0].email).toBe('byid@example.com');
  });

  it('leaves the email empty when two different Seerr users match the same name', () => {
    const result = enrichMembersWithEmail(
      [member('a'.repeat(32), 'sam')],
      [seerr(1, { displayName: 'Sam' }), seerr(2, { plexUsername: 'sam' })]
    );
    expect(result[0].email).toBe('');
  });

  it('counts one Seerr user once even when several of its fields match', () => {
    const result = enrichMembersWithEmail(
      [member('a'.repeat(32), 'sam')],
      [seerr(1, { username: 'Sam', displayName: 'Sam', plexUsername: 'sam', email: 'sam@example.com' })]
    );
    expect(result[0].email).toBe('sam@example.com');
  });

  it('leaves the email empty when nothing matches or the match has no email', () => {
    expect(enrichMembersWithEmail([member('a'.repeat(32), 'nobody')], [seerr(1, { displayName: 'someone' })])[0].email).toBe('');
    expect(enrichMembersWithEmail([member('a'.repeat(32), 'sam')], [seerr(1, { displayName: 'sam', email: '' })])[0].email).toBe('');
  });

  it('never overwrites an existing email and never touches plex members', () => {
    const jellyfinWithEmail = member('a'.repeat(32), 'sam', 'kept@example.com');
    const plexMember: MediaMember = { provider: 'plex', userId: '1', username: 'sam', email: '' };
    const result = enrichMembersWithEmail([jellyfinWithEmail, plexMember], [seerr(1, { displayName: 'sam', email: 'other@example.com' })]);
    expect(result[0].email).toBe('kept@example.com');
    expect(result[1].email).toBe('');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/lib/media/seerr-emails.test.ts`
Expected: FAIL (module does not exist).

- [ ] **Step 3: Implement `src/lib/media/seerr-emails.ts`**

```ts
import { timeoutSignal } from '../fetch-timeout';
import type { MediaMember } from './types';

export interface SeerrUser {
  id: number;
  email: string;
  username: string | null;
  displayName: string | null;
  plexUsername: string | null;
  jellyfinUsername: string | null;
  jellyfinUserId: string | null;
}

interface RawSeerrUser {
  id: number;
  email?: string | null;
  username?: string | null;
  displayName?: string | null;
  plexUsername?: string | null;
  jellyfinUsername?: string | null;
  jellyfinUserId?: string | null;
}

const PAGE_SIZE = 100;
// Safety bound: 5000 users. A real install has a few dozen.
const MAX_PAGES = 50;

// Seerr / Overseerr `GET /api/v1/user` (X-Api-Key), paginated with take/skip;
// the response is { pageInfo: { pages, ... }, results: [...] }.
export async function fetchSeerrUsers(
  url: string,
  apiKey: string,
  fetchFn: typeof fetch = fetch
): Promise<SeerrUser[]> {
  const users: SeerrUser[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetchFn(`${url}/api/v1/user?take=${PAGE_SIZE}&skip=${page * PAGE_SIZE}`, {
      headers: { 'X-Api-Key': apiKey, Accept: 'application/json' },
      signal: timeoutSignal(),
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`Seerr API request failed: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as { pageInfo?: { pages?: number }; results?: RawSeerrUser[] };
    for (const u of data.results ?? []) {
      users.push({
        id: u.id,
        email: u.email ?? '',
        username: u.username ?? null,
        displayName: u.displayName ?? null,
        plexUsername: u.plexUsername ?? null,
        jellyfinUsername: u.jellyfinUsername ?? null,
        jellyfinUserId: u.jellyfinUserId ?? null,
      });
    }
    if (page + 1 >= (data.pageInfo?.pages ?? 1)) break;
  }
  return users;
}

const normalizeId = (id: string) => id.toLowerCase().replace(/-/g, '');
const normalizeName = (name: string) => name.trim().toLowerCase();

function findEmail(member: MediaMember, users: SeerrUser[]): string | null {
  const wantedId = normalizeId(member.userId);
  const byId = users.filter((u) => u.email && u.jellyfinUserId && normalizeId(u.jellyfinUserId) === wantedId);
  if (byId.length === 1) return byId[0].email;
  if (byId.length > 1) return null;

  // Fallback by name. It crosses identity spaces on purpose (the Seerr users
  // of a Plex-mode install are Plex accounts, with no Jellyfin id), so it only
  // fires on exactly one distinct Seerr user, never on an ambiguous name.
  const wantedName = normalizeName(member.username);
  if (!wantedName) return null;
  const byName = users.filter(
    (u) =>
      u.email &&
      [u.jellyfinUsername, u.username, u.displayName, u.plexUsername].some((v) => v && normalizeName(v) === wantedName)
  );
  const distinct = new Set(byName.map((u) => u.id));
  return distinct.size === 1 ? byName[0].email : null;
}

// Jellyfin users have no email. Fills the empty ones from Seerr users; never
// overwrites an existing email and never touches other providers' members.
export function enrichMembersWithEmail(members: MediaMember[], seerrUsers: SeerrUser[]): MediaMember[] {
  return members.map((member) => {
    if (member.provider !== 'jellyfin' || member.email) return member;
    const email = findEmail(member, seerrUsers);
    return email ? { ...member, email } : member;
  });
}
```

- [ ] **Step 4: Verify and commit**

```bash
npx vitest run tests/lib/media/seerr-emails.test.ts 2>&1 | tail -15
npm run typecheck 2>&1 | tail -10
npx vitest run 2>&1 | tail -10
git add -A
git commit -m "feat: fill Jellyfin member emails from Seerr/Overseerr users" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

Expected: tests PASS; typecheck clean; suite green except the pre-existing failure.

---

### Task 6: Password login (route, shared login helper, login page)

**Files:**
- Create: `src/lib/login.ts`, `src/app/api/auth/password/route.ts`, `src/components/PlexLoginButton.tsx`, `src/components/JellyfinLoginForm.tsx`
- Modify: `src/app/api/auth/poll/route.ts`, `src/app/login/page.tsx`
- Test: `tests/lib/login.test.ts`, `tests/api/auth-password.test.ts`; `tests/api/auth.test.ts` must pass unchanged

**Interfaces:**
- Consumes: `getPasswordAuth`, `getActiveProviders` (registry); `enrichMembersWithEmail`, `fetchSeerrUsers` (Task 5); `checkRateLimit`, `getClientIp`, `resetRateLimitsForTests` from `src/lib/rate-limit.ts`; `createSession`, `SESSION_COOKIE_NAME`.
- Produces: `completeLogin(db, sessionSecret, user: MediaMember, isOwner: boolean): Promise<NextResponse>`; `resolveLoginEmail(db, member, seerr: { url: string; apiKey: string } | null, fetchFn?): Promise<MediaMember>`; `POST /api/auth/password` (`{ provider: 'jellyfin', username, password }` → `200 { status: 'ok' }` + session cookie, `401 { status: 'denied' }`, `400`, `429`, `503`, `502`).

- [ ] **Step 1: Write the failing tests**

`tests/lib/login.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getDb, resetDbForTests } from '../../src/lib/db';
import { completeLogin, resolveLoginEmail } from '../../src/lib/login';
import { verifySession, SESSION_COOKIE_NAME } from '../../src/lib/session';
import type { MediaMember } from '../../src/lib/media/types';

const SECRET = 'test-secret-at-least-32-characters-long';

beforeEach(() => {
  resetDbForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const jf = (email = ''): MediaMember => ({ provider: 'jellyfin', userId: 'a'.repeat(32), username: 'alice', email });

describe('completeLogin', () => {
  it('upserts the user and sets a verifiable session cookie', async () => {
    const db = getDb(':memory:');
    const response = await completeLogin(db, SECRET, jf('a@b.com'), true);
    expect(await response.json()).toEqual({ status: 'ok' });
    const cookie = response.cookies.get(SESSION_COOKIE_NAME);
    expect(cookie?.value).toBeTruthy();
    expect(await verifySession(cookie!.value, SECRET)).toEqual({
      provider: 'jellyfin',
      userId: 'a'.repeat(32),
      username: 'alice',
      email: 'a@b.com',
      isOwner: true,
    });
    const row = db.prepare("SELECT email, username FROM users WHERE provider = 'jellyfin' AND external_id = ?").get('a'.repeat(32));
    expect(row).toEqual({ email: 'a@b.com', username: 'alice' });
  });

  it('keeps an existing email when the new login has none (Jellyfin has no email of its own)', async () => {
    const db = getDb(':memory:');
    db.prepare("INSERT INTO users (provider, external_id, email, username, last_login) VALUES ('jellyfin', ?, 'kept@b.com', 'old', '')").run('a'.repeat(32));
    await completeLogin(db, SECRET, jf(''), false);
    const row = db.prepare("SELECT email, username FROM users WHERE provider = 'jellyfin' AND external_id = ?").get('a'.repeat(32)) as { email: string; username: string };
    expect(row.email).toBe('kept@b.com');
    expect(row.username).toBe('alice');
  });

  it('still overwrites the email when a provider supplies a new non-empty one', async () => {
    const db = getDb(':memory:');
    db.prepare("INSERT INTO users (provider, external_id, email, username, last_login) VALUES ('jellyfin', ?, 'old@b.com', 'x', '')").run('a'.repeat(32));
    await completeLogin(db, SECRET, jf('new@b.com'), false);
    const row = db.prepare("SELECT email FROM users WHERE external_id = ?").get('a'.repeat(32)) as { email: string };
    expect(row.email).toBe('new@b.com');
  });
});

describe('resolveLoginEmail', () => {
  const seerrOk = () =>
    vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        pageInfo: { pages: 1 },
        results: [{ id: 1, email: 'seerr@b.com', displayName: 'Alice', username: null, plexUsername: null, jellyfinUsername: null, jellyfinUserId: null }],
      }),
    }) as unknown as Response) as unknown as typeof fetch;

  it('returns the member untouched when it already has an email', async () => {
    const db = getDb(':memory:');
    const fetchFn = seerrOk();
    expect(await resolveLoginEmail(db, jf('has@b.com'), { url: 'http://s', apiKey: 'k' }, fetchFn)).toEqual(jf('has@b.com'));
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('uses the email already stored for that member without calling Seerr', async () => {
    const db = getDb(':memory:');
    db.prepare("INSERT INTO users (provider, external_id, email, username, last_login) VALUES ('jellyfin', ?, 'stored@b.com', 'alice', '')").run('a'.repeat(32));
    const fetchFn = seerrOk();
    expect((await resolveLoginEmail(db, jf(''), { url: 'http://s', apiKey: 'k' }, fetchFn)).email).toBe('stored@b.com');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('looks the email up in Seerr when nothing is stored', async () => {
    const db = getDb(':memory:');
    expect((await resolveLoginEmail(db, jf(''), { url: 'http://s', apiKey: 'k' }, seerrOk())).email).toBe('seerr@b.com');
  });

  it('never fails the login when Seerr is unreachable or not configured', async () => {
    const db = getDb(':memory:');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const failing = vi.fn(async () => {
      throw new Error('down');
    }) as unknown as typeof fetch;
    expect((await resolveLoginEmail(db, jf(''), { url: 'http://s', apiKey: 'k' }, failing)).email).toBe('');
    expect((await resolveLoginEmail(db, jf(''), null, seerrOk())).email).toBe('');
  });
});
```

`tests/api/auth-password.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb, resetDbForTests } from '../../src/lib/db';
import { resetRateLimitsForTests } from '../../src/lib/rate-limit';
import { resetTtlCacheForTests } from '../../src/lib/ttl-cache';
import { verifySession, SESSION_COOKIE_NAME } from '../../src/lib/session';

const SESSION_SECRET = 'test-secret-at-least-32-characters-long';
const UID = '1a2b3c4d5e6f47a8b9c0d1e2f3a4b5c6';
const PASSWORD = 'correct-horse-battery-staple';

const BASE_ENV: Record<string, string> = {
  DATABASE_PATH: ':memory:',
  SESSION_SECRET,
  PLEX_URL: 'https://plex.local',
  PLEX_SERVER_TOKEN: 'server-token',
  PLEX_SERVER_NAME: 'My Plex Server',
  PLEX_CLIENT_IDENTIFIER: 'cid',
  TAUTULLI_URL: 'http://tautulli.local',
  TAUTULLI_API_KEY: 'tautulli-key',
  SONARR_URL: 'http://sonarr.local',
  SONARR_API_KEY: 'sonarr-key',
  RADARR_URL: 'http://radarr.local',
  RADARR_API_KEY: 'radarr-key',
  OVERSEERR_URL: 'http://seerr.local:5055',
  OVERSEERR_API_KEY: 'seerr-key',
  SMTP_HOST: 'mail.local',
  SMTP_PORT: '465',
  SMTP_USER: 'u',
  SMTP_PASS: 'p',
  MAIL_FROM_ADDRESS: 'admin@local',
  MAIL_FROM_NAME: 'Portarr',
  PUBLIC_BASE_URL: 'https://portal.example.com',
  JELLYFIN_URL: 'http://jellyfin.local:8096',
  JELLYFIN_API_KEY: 'jf-key',
};

let saved: Record<string, string | undefined> = {};
let fetchLog: string[] = [];

function jsonRes(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, statusText: status === 200 ? 'OK' : 'Error', json: async () => body } as unknown as Response;
}

function installFetch(opts: { auth?: () => Response; seerr?: () => Response } = {}) {
  const auth =
    opts.auth ??
    (() => jsonRes({ User: { Id: UID, Name: 'alice', Policy: { IsAdministrator: true, IsDisabled: false } }, AccessToken: 'usertoken' }));
  const seerr =
    opts.seerr ??
    (() => jsonRes({ pageInfo: { pages: 1 }, results: [{ id: 1, email: 'alice@example.com', displayName: 'Alice', username: null, plexUsername: 'Alice', jellyfinUsername: null, jellyfinUserId: null }] }));
  vi.spyOn(global, 'fetch').mockImplementation((async (input: string | URL | Request) => {
    const url = String(input);
    fetchLog.push(url);
    if (url.includes('/Users/AuthenticateByName')) return auth();
    if (url.includes('/Sessions/Logout')) return jsonRes(null, 204);
    if (url.includes('/api/v1/user')) return seerr();
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch);
}

function request(body: unknown, ip = '10.0.0.1'): NextRequest {
  return new NextRequest('http://localhost/api/auth/password', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const login = (overrides: Record<string, unknown> = {}, ip?: string) =>
  request({ provider: 'jellyfin', username: 'alice', password: PASSWORD, ...overrides }, ip);

beforeEach(() => {
  saved = {};
  for (const [k, v] of Object.entries(BASE_ENV)) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }
  fetchLog = [];
  resetDbForTests();
  resetRateLimitsForTests();
  resetTtlCacheForTests();
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.restoreAllMocks();
});

describe('POST /api/auth/password', () => {
  it('logs a jellyfin user in: session cookie, user row with the Seerr email, temporary Jellyfin session ended', async () => {
    installFetch();
    const { POST } = await import('../../src/app/api/auth/password/route');
    const response = await POST(login());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
    const cookie = response.cookies.get(SESSION_COOKIE_NAME);
    expect(await verifySession(cookie!.value, SESSION_SECRET)).toEqual({
      provider: 'jellyfin',
      userId: UID,
      username: 'alice',
      email: 'alice@example.com',
      isOwner: true,
    });
    const row = getDb().prepare("SELECT email FROM users WHERE provider = 'jellyfin' AND external_id = ?").get(UID);
    expect(row).toEqual({ email: 'alice@example.com' });
    expect(fetchLog.some((u) => u.includes('/Sessions/Logout'))).toBe(true);
  });

  it('never puts the password in the response, the cookie or the logs', async () => {
    installFetch();
    const logSpies = [
      vi.spyOn(console, 'log').mockImplementation(() => {}),
      vi.spyOn(console, 'error').mockImplementation(() => {}),
      vi.spyOn(console, 'warn').mockImplementation(() => {}),
    ];
    const { POST } = await import('../../src/app/api/auth/password/route');
    const response = await POST(login());
    expect(JSON.stringify(await response.json())).not.toContain(PASSWORD);
    expect(response.cookies.get(SESSION_COOKIE_NAME)?.value).not.toContain(PASSWORD);
    for (const spy of logSpies) expect(JSON.stringify(spy.mock.calls)).not.toContain(PASSWORD);
  });

  it('answers 401 denied, with no cookie, for wrong credentials (401 from Jellyfin)', async () => {
    installFetch({ auth: () => jsonRes('Error processing request.', 401) });
    const { POST } = await import('../../src/app/api/auth/password/route');
    const response = await POST(login());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ status: 'denied' });
    expect(response.cookies.get(SESSION_COOKIE_NAME)).toBeUndefined();
  });

  it('answers 401 denied for a disabled account', async () => {
    installFetch({ auth: () => jsonRes({ User: { Id: UID, Name: 'alice', Policy: { IsAdministrator: false, IsDisabled: true } }, AccessToken: 't' }) });
    const { POST } = await import('../../src/app/api/auth/password/route');
    const response = await POST(login());
    expect(response.status).toBe(401);
    expect(response.cookies.get(SESSION_COOKIE_NAME)).toBeUndefined();
  });

  it('still logs in, with an empty email, when Seerr is down', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    installFetch({ seerr: () => jsonRes({}, 500) });
    const { POST } = await import('../../src/app/api/auth/password/route');
    const response = await POST(login());
    expect(response.status).toBe(200);
    const cookie = response.cookies.get(SESSION_COOKIE_NAME);
    expect((await verifySession(cookie!.value, SESSION_SECRET))?.email).toBe('');
  });

  it('keeps an email already stored for the member and does not call Seerr', async () => {
    installFetch();
    getDb().prepare("INSERT INTO users (provider, external_id, email, username, last_login) VALUES ('jellyfin', ?, 'stored@example.com', 'alice', '')").run(UID);
    const { POST } = await import('../../src/app/api/auth/password/route');
    const response = await POST(login());
    expect(response.status).toBe(200);
    expect(fetchLog.some((u) => u.includes('/api/v1/user'))).toBe(false);
    const row = getDb().prepare("SELECT email FROM users WHERE external_id = ?").get(UID);
    expect(row).toEqual({ email: 'stored@example.com' });
  });

  it('rejects malformed requests with 400 and never calls Jellyfin', async () => {
    installFetch();
    const { POST } = await import('../../src/app/api/auth/password/route');
    for (const body of [
      'not json',
      { provider: 'plex', username: 'a', password: 'b' },
      { provider: 'jellyfin', username: '', password: 'b' },
      { provider: 'jellyfin', username: 'a' },
      { provider: 'jellyfin', username: 'a', password: 'x'.repeat(257) },
      { provider: 'jellyfin', username: 'x'.repeat(129), password: 'b' },
    ]) {
      const response = await POST(request(body, `10.0.1.${Math.floor(Math.random() * 200)}`));
      expect(response.status).toBe(400);
    }
    expect(fetchLog).toHaveLength(0);
  });

  it('answers 400 provider_unavailable when Jellyfin is not configured', async () => {
    installFetch();
    delete process.env.JELLYFIN_URL;
    delete process.env.JELLYFIN_API_KEY;
    const { POST } = await import('../../src/app/api/auth/password/route');
    const response = await POST(login());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'provider_unavailable' });
  });

  it('answers 503 setup_incomplete before setup is done', async () => {
    installFetch();
    delete process.env.SONARR_URL;
    const { POST } = await import('../../src/app/api/auth/password/route');
    const response = await POST(login());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'setup_incomplete' });
  });

  it('rate-limits per IP: the 11th attempt in the window is refused with the French message', async () => {
    installFetch({ auth: () => jsonRes('nope', 401) });
    const { POST } = await import('../../src/app/api/auth/password/route');
    for (let i = 0; i < 10; i++) {
      expect((await POST(login({ username: `user${i}` }, '10.9.9.9'))).status).toBe(401);
    }
    const blocked = await POST(login({ username: 'user11' }, '10.9.9.9'));
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ error: 'Trop de tentatives, réessayez plus tard.' });
  });

  it('rate-limits per username even across different IPs: the 6th attempt is refused', async () => {
    installFetch({ auth: () => jsonRes('nope', 401) });
    const { POST } = await import('../../src/app/api/auth/password/route');
    for (let i = 0; i < 5; i++) {
      expect((await POST(login({ username: 'Alice' }, `10.1.0.${i}`))).status).toBe(401);
    }
    const blocked = await POST(login({ username: 'alice' }, '10.1.0.99'));
    expect(blocked.status).toBe(429);
  });

  it('answers 502 when Jellyfin fails, without leaking anything about the request', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    installFetch({ auth: () => jsonRes({}, 500) });
    const { POST } = await import('../../src/app/api/auth/password/route');
    const response = await POST(login());
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain(PASSWORD);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/lib/login.test.ts tests/api/auth-password.test.ts`
Expected: FAIL (`login.ts` and the route do not exist).

- [ ] **Step 3: Implement `src/lib/login.ts`**

```ts
import { NextResponse } from 'next/server';
import type Database from 'better-sqlite3';
import { createSession, SESSION_COOKIE_NAME } from './session';
import { enrichMembersWithEmail, fetchSeerrUsers } from './media/seerr-emails';
import type { MediaMember } from './media/types';

// The one place a successful login turns into a `users` row and a session
// cookie, shared by every provider (Plex PIN poll, Jellyfin password).
export async function completeLogin(
  db: Database.Database,
  sessionSecret: string,
  user: MediaMember,
  isOwner: boolean
): Promise<NextResponse> {
  // Jellyfin members have no email of their own, so a login with an empty email
  // must not erase one already filled by the member sync or a Seerr lookup.
  db.prepare(
    `INSERT INTO users (provider, external_id, email, username, last_login) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(provider, external_id) DO UPDATE SET
       email = CASE WHEN excluded.email != '' THEN excluded.email ELSE users.email END,
       username = excluded.username,
       last_login = excluded.last_login`
  ).run(user.provider, user.userId, user.email, user.username, new Date().toISOString());

  const token = await createSession({ ...user, isOwner }, sessionSecret);
  const response = NextResponse.json({ status: 'ok' });
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}

// Email for a member whose provider has none: the one already stored, else a
// Seerr lookup. Never fails a login: any Seerr problem just leaves it empty.
export async function resolveLoginEmail(
  db: Database.Database,
  member: MediaMember,
  seerr: { url: string; apiKey: string } | null,
  fetchFn: typeof fetch = fetch
): Promise<MediaMember> {
  if (member.email) return member;

  const stored = db
    .prepare('SELECT email FROM users WHERE provider = ? AND external_id = ?')
    .get(member.provider, member.userId) as { email: string } | undefined;
  if (stored?.email) return { ...member, email: stored.email };

  if (!seerr) return member;
  try {
    const users = await fetchSeerrUsers(seerr.url, seerr.apiKey, fetchFn);
    return enrichMembersWithEmail([member], users)[0];
  } catch (err) {
    console.error('Failed to look up the member email in Seerr:', err instanceof Error ? err.message : 'unknown error');
    return member;
  }
}
```

- [ ] **Step 4: Refactor the Plex poll route to use `completeLogin`**

In `src/app/api/auth/poll/route.ts`: replace the import line `import { createSession, SESSION_COOKIE_NAME } from '@/lib/session';` with `import { completeLogin } from '@/lib/login';`, and replace everything after `if (result.status !== 'ok') { return NextResponse.json({ status: result.status }); }` up to (not including) the `} catch (err) {` with:

```ts
    return await completeLogin(getDb(), config.session.secret, result.user, result.isOwner);
```
(the surrounding `try`, the `catch` block and its `'Failed to verify login status'` 502 stay exactly as they are).

- [ ] **Step 5: Implement `POST /api/auth/password`**

`src/app/api/auth/password/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { loadConfig, isSetupComplete, assertConfigured } from '@/lib/config';
import { getDb } from '@/lib/db';
import { getActiveProviders, getPasswordAuth } from '@/lib/media/registry';
import { completeLogin, resolveLoginEmail } from '@/lib/login';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

// Portarr must not become a password-guessing relay in front of Jellyfin:
// limit per IP (like the Plex login) AND per username, so one account cannot
// be hammered from many addresses. A consequence, accepted: someone can burn a
// legitimate user's attempts for a few minutes.
const IP_LIMIT = { max: 10, windowMs: 5 * 60 * 1000 };
const USERNAME_LIMIT = { max: 5, windowMs: 5 * 60 * 1000 };
const MAX_USERNAME_LENGTH = 128;
const MAX_PASSWORD_LENGTH = 256;
const TOO_MANY = { error: 'Trop de tentatives, réessayez plus tard.' };

export async function POST(request: NextRequest) {
  if (!checkRateLimit(`password-login-ip:${getClientIp(request)}`, IP_LIMIT)) {
    return NextResponse.json(TOO_MANY, { status: 429 });
  }

  let body: { provider?: unknown; username?: unknown; password?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const { provider, username, password } = body;
  if (
    provider !== 'jellyfin' ||
    typeof username !== 'string' ||
    typeof password !== 'string' ||
    !username.trim() ||
    !password ||
    username.length > MAX_USERNAME_LENGTH ||
    password.length > MAX_PASSWORD_LENGTH
  ) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
  const name = username.trim();

  if (!checkRateLimit(`password-login-user:${name.toLowerCase()}`, USERNAME_LIMIT)) {
    return NextResponse.json(TOO_MANY, { status: 429 });
  }

  try {
    const rawConfig = loadConfig(process.env, getDb());
    if (!isSetupComplete(rawConfig)) {
      return NextResponse.json({ error: 'setup_incomplete' }, { status: 503 });
    }
    const config = assertConfigured(rawConfig);
    if (!getActiveProviders(config).some((p) => p.id === 'jellyfin')) {
      return NextResponse.json({ error: 'provider_unavailable' }, { status: 400 });
    }

    const result = await getPasswordAuth(config, 'jellyfin').authenticate(name, password);
    if (result.status !== 'ok') {
      // Same answer for a wrong password, an unknown account and a disabled one.
      return NextResponse.json({ status: 'denied' }, { status: 401 });
    }

    const db = getDb();
    const member = await resolveLoginEmail(db, result.user, config.overseerr);
    return await completeLogin(db, config.session.secret, member, result.isOwner);
  } catch (err) {
    // Only the message: never the request, the body or the password.
    console.error('Failed to verify password login:', err instanceof Error ? err.message : 'unknown error');
    return NextResponse.json({ error: 'Failed to verify login' }, { status: 502 });
  }
}
```

- [ ] **Step 6: Login page and controls**

`src/components/PlexLoginButton.tsx`: move the current client component out of `src/app/login/page.tsx` unchanged in behavior. Take the file's current content, rename `export default function LoginPage()` to `export function PlexLoginButton()`, and replace its returned JSX (`<main ...>...</main>`) with only the Plex-specific fragment:

```tsx
  return (
    <>
      {state === 'denied' && (
        <p className="text-sm text-red-400">
          Ce compte Plex n&apos;a pas accès au serveur Portarr.
        </p>
      )}
      {state === 'error' && <p className="text-sm text-red-400">Une erreur est survenue.</p>}
      {state === 'waiting' && blockedAuthUrl && (
        <p className="text-sm text-plexcrew-amber">
          Votre navigateur a bloqué la fenêtre de connexion.{' '}
          <a href={blockedAuthUrl} target="_blank" rel="noreferrer" className="underline hover:no-underline">
            Cliquez ici pour continuer
          </a>
          .
        </p>
      )}
      <button
        onClick={handleLogin}
        disabled={state === 'waiting'}
        className="rounded-full bg-plexcrew-amber px-6 py-3 font-semibold text-plexcrew-ink transition-colors hover:bg-plexcrew-amber/90 disabled:opacity-60"
      >
        {state === 'waiting' ? 'En attente de connexion Plex…' : 'Se connecter avec Plex'}
      </button>
    </>
  );
```
Everything above the `return` (state, refs, `useEffect`, `handleLogin` with its comments) moves verbatim.

`src/components/JellyfinLoginForm.tsx`:

```tsx
'use client';

import { useState, type FormEvent } from 'react';

type FormState = 'idle' | 'submitting' | 'denied' | 'limited' | 'error';

export function JellyfinLoginForm() {
  const [state, setState] = useState<FormState>('idle');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setState('submitting');
    try {
      const res = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'jellyfin', username, password }),
      });
      if (res.ok) {
        window.location.href = '/';
        return;
      }
      // Never keep a rejected password in the form state.
      setPassword('');
      setState(res.status === 401 ? 'denied' : res.status === 429 ? 'limited' : 'error');
    } catch {
      setPassword('');
      setState('error');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3">
      {state === 'denied' && (
        <p className="text-sm text-red-400">Identifiants incorrects ou compte désactivé.</p>
      )}
      {state === 'limited' && (
        <p className="text-sm text-red-400">Trop de tentatives, réessayez plus tard.</p>
      )}
      {state === 'error' && <p className="text-sm text-red-400">Une erreur est survenue.</p>}
      <input
        type="text"
        name="username"
        autoComplete="username"
        required
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Identifiant Jellyfin"
        className="rounded-md border border-plexcrew-teal/20 bg-plexcrew-charcoal/60 px-3 py-2 text-plexcrew-screen"
      />
      <input
        type="password"
        name="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Mot de passe"
        className="rounded-md border border-plexcrew-teal/20 bg-plexcrew-charcoal/60 px-3 py-2 text-plexcrew-screen"
      />
      <button
        type="submit"
        disabled={state === 'submitting'}
        className="rounded-full bg-plexcrew-teal px-6 py-3 font-semibold text-plexcrew-ink transition-colors hover:bg-plexcrew-teal/90 disabled:opacity-60"
      >
        {state === 'submitting' ? 'Connexion…' : 'Se connecter avec Jellyfin'}
      </button>
    </form>
  );
}
```

`src/app/login/page.tsx` (replace the whole file; it becomes a server component):

```tsx
import { loadConfig, isSetupComplete } from '@/lib/config';
import { getDb } from '@/lib/db';
import { getActiveProviders } from '@/lib/media/registry';
import type { ProviderId } from '@/lib/media/types';
import { PlexLoginButton } from '@/components/PlexLoginButton';
import { JellyfinLoginForm } from '@/components/JellyfinLoginForm';

// Reads the config at request time (which providers are active), so it can
// never be prerendered.
export const dynamic = 'force-dynamic';

export default function LoginPage() {
  const config = loadConfig(process.env, getDb());
  // Before setup completes no provider is active; keep offering the Plex
  // button, as this page always did.
  const active: ProviderId[] = isSetupComplete(config)
    ? getActiveProviders(config).map((p) => p.id)
    : ['plex'];

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center gap-4 bg-cover bg-center"
      style={{ backgroundImage: "url('/login-background.jpg')" }}
    >
      <div className="mx-4 flex w-full max-w-sm flex-col items-center gap-5 rounded-2xl bg-plexcrew-ink/85 p-10 text-center shadow-2xl shadow-black/50 ring-1 ring-plexcrew-teal/30 backdrop-blur-md">
        <img src="/logo.png" alt="Portarr" className="h-24 w-24" />
        <h1 className="font-display text-4xl leading-none tracking-[0.1em] text-plexcrew-screen">
          Portarr
        </h1>
        {active.includes('plex') && <PlexLoginButton />}
        {active.includes('plex') && active.includes('jellyfin') && (
          <p className="text-xs uppercase tracking-wider text-plexcrew-ash">ou</p>
        )}
        {active.includes('jellyfin') && <JellyfinLoginForm />}
      </div>
    </main>
  );
}
```

- [ ] **Step 7: Verify and commit**

```bash
npx vitest run tests/lib/login.test.ts tests/api/auth-password.test.ts tests/api/auth.test.ts 2>&1 | tail -20
npm run typecheck 2>&1 | tail -15
npx vitest run 2>&1 | tail -10
SESSION_SECRET=verify-secret-0123456789abcdef0123456789 npm run build 2>&1 | tail -20
```

Expected: the new tests PASS; `auth.test.ts` (the Plex login) passes unchanged; typecheck clean; whole suite green except the pre-existing failure; `next build` succeeds (the login page is `force-dynamic`, so it is not prerendered).

```bash
git add -A
git commit -m "feat: add Jellyfin password login, shared login helper and provider-aware login page" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Member sync emails, provider badge and final verification

**Files:**
- Create: `src/lib/media/labels.ts`
- Modify: `src/app/api/admin/members/sync/route.ts`, `src/components/AdminMembersList.tsx`
- Test: `tests/lib/media/labels.test.ts`, `tests/api/admin-members-sync-jellyfin.test.ts`

**Interfaces:**
- Consumes: `enrichMembersWithEmail`, `fetchSeerrUsers` (Task 5); `getActiveProviders`, `listMembersAll`; `syncMembers` (sub-project 1).
- Produces: `providerLabel(provider: ProviderId): string`.

- [ ] **Step 1: Write the failing tests**

`tests/lib/media/labels.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { providerLabel } from '../../../src/lib/media/labels';

describe('providerLabel', () => {
  it('names each provider for the admin badge', () => {
    expect(providerLabel('plex')).toBe('Plex');
    expect(providerLabel('jellyfin')).toBe('Jellyfin');
  });
});
```

`tests/api/admin-members-sync-jellyfin.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb, resetDbForTests } from '../../src/lib/db';
import { resetTtlCacheForTests } from '../../src/lib/ttl-cache';
import { createSession, SESSION_COOKIE_NAME } from '../../src/lib/session';

const SECRET = 'test-secret-at-least-32-characters-long';

const ENV: Record<string, string> = {
  DATABASE_PATH: ':memory:',
  SESSION_SECRET: SECRET,
  PLEX_URL: 'https://plex.local',
  PLEX_SERVER_TOKEN: 'server-token',
  PLEX_SERVER_NAME: 'My Plex Server',
  PLEX_CLIENT_IDENTIFIER: 'cid',
  TAUTULLI_URL: 'http://tautulli.local',
  TAUTULLI_API_KEY: 'tautulli-key',
  SONARR_URL: 'http://sonarr.local',
  SONARR_API_KEY: 'sonarr-key',
  RADARR_URL: 'http://radarr.local',
  RADARR_API_KEY: 'radarr-key',
  OVERSEERR_URL: 'http://seerr.local:5055',
  OVERSEERR_API_KEY: 'seerr-key',
  SMTP_HOST: 'mail.local',
  SMTP_PORT: '465',
  SMTP_USER: 'u',
  SMTP_PASS: 'p',
  MAIL_FROM_ADDRESS: 'admin@local',
  MAIL_FROM_NAME: 'Portarr',
  PUBLIC_BASE_URL: 'https://portal.example.com',
  JELLYFIN_URL: 'http://jellyfin.local:8096',
  JELLYFIN_API_KEY: 'jf-key',
};

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const [k, v] of Object.entries(ENV)) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }
  resetDbForTests();
  resetTtlCacheForTests();
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.restoreAllMocks();
});

function json(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, statusText: status === 200 ? 'OK' : 'Error', json: async () => body, text: async () => '<MediaContainer/>' } as unknown as Response;
}

function installFetch(seerr: () => Response) {
  vi.spyOn(global, 'fetch').mockImplementation((async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('plex.tv/api/users')) return json({});
    if (url.endsWith('/Users')) {
      return json([
        { Id: 'a'.repeat(32), Name: 'alice', Policy: { IsAdministrator: true, IsDisabled: false } },
        { Id: 'b'.repeat(32), Name: 'stranger', Policy: { IsAdministrator: false, IsDisabled: false } },
      ]);
    }
    if (url.includes('/api/v1/user')) return seerr();
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch);
}

async function ownerRequest(): Promise<NextRequest> {
  const token = await createSession({ provider: 'plex', userId: '1', email: 'o@b.com', username: 'owner', isOwner: true }, SECRET);
  return new NextRequest('http://localhost/api/admin/members/sync', {
    method: 'POST',
    headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
  });
}

describe('POST /api/admin/members/sync with Jellyfin', () => {
  it('syncs Jellyfin members and fills their emails from Seerr, skipping the ones it cannot match', async () => {
    installFetch(() =>
      json({ pageInfo: { pages: 1 }, results: [{ id: 1, email: 'alice@example.com', displayName: 'Alice', username: null, plexUsername: 'Alice', jellyfinUsername: null, jellyfinUserId: null }] })
    );
    const { POST } = await import('../../src/app/api/admin/members/sync/route');
    const response = await POST(await ownerRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ added: 1, updated: 0, skippedNoEmail: 1, total: 1 });
    const rows = getDb().prepare("SELECT provider, external_id, email, username FROM users").all();
    expect(rows).toEqual([{ provider: 'jellyfin', external_id: 'a'.repeat(32), email: 'alice@example.com', username: 'alice' }]);
  });

  it('still syncs (with no Jellyfin email) when Seerr is down', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    installFetch(() => json({}, 500));
    const { POST } = await import('../../src/app/api/admin/members/sync/route');
    const response = await POST(await ownerRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ added: 0, updated: 0, skippedNoEmail: 2, total: 0 });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/lib/media/labels.test.ts tests/api/admin-members-sync-jellyfin.test.ts`
Expected: FAIL (`labels.ts` does not exist; the sync route does not enrich).

- [ ] **Step 3: Implement the label, the sync enrichment and the badge**

`src/lib/media/labels.ts`:

```ts
import type { ProviderId } from './types';

export function providerLabel(provider: ProviderId): string {
  return provider === 'jellyfin' ? 'Jellyfin' : 'Plex';
}
```

`src/app/api/admin/members/sync/route.ts`: add `import { enrichMembersWithEmail, fetchSeerrUsers } from '@/lib/media/seerr-emails';` and replace

```ts
    const members = await listMembersAll(getActiveProviders(config));
```
with
```ts
    let members = await listMembersAll(getActiveProviders(config));
    // Jellyfin has no email: fill the empty ones from Seerr. A Seerr failure
    // only leaves those members without an email (they are skipped by the sync).
    if (members.some((m) => m.provider === 'jellyfin' && !m.email)) {
      try {
        members = enrichMembersWithEmail(members, await fetchSeerrUsers(config.overseerr.url, config.overseerr.apiKey));
      } catch (err) {
        console.error('Failed to fetch Seerr users for member emails:', err instanceof Error ? err.message : 'unknown error');
      }
    }
```
(the rest of the route, including the `'Failed to sync Plex users'` catch, is unchanged).

`src/components/AdminMembersList.tsx`: add `import { providerLabel } from '@/lib/media/labels';` and, right after `{m.username}` inside the first `<td>`, before the email `<span>`:

```tsx
                <span className="ml-2 rounded border border-plexcrew-teal/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-plexcrew-ash">
                  {providerLabel(m.provider)}
                </span>
```

- [ ] **Step 4: Full verification**

```bash
npm run typecheck 2>&1 | tail -10
npx vitest run 2>&1 | tail -15
SESSION_SECRET=verify-secret-0123456789abcdef0123456789 npm run build 2>&1 | tail -20
git diff --stat main..HEAD 2>/dev/null | tail -1
grep -rn "JELLYFIN_API_KEY\|jf-key\|key123" src | grep -v "process.env\|env\.JELLYFIN\|envKey\|// " | head
git diff feat/media-server-abstraction..HEAD | grep -inE "tapi_|sk-[a-z0-9]{6}|trr_pub|uk13_|BEGIN (RSA|PRIVATE)" | head
```

Expected: typecheck clean; vitest green except the pre-existing `dashboard-stats` failure; `next build` succeeds (Edge middleware compiles with the Jellyfin modules); the last two greps print nothing.

- [ ] **Step 5: Optional live smoke test against your own Jellyfin (read-only)**

If you have a Jellyfin server at hand, create a dedicated read-only API key for the test and run the provider against it with a throwaway script (never print, log or commit the key): build the provider with `createJellyfinProvider({ url, apiKey })`, then call `recentlyAddedSplit(5)`, `search('...')`, `listMembers()`, `isMember(...)` and `poster(<a thumbPath>)`. Check: real titles with at most one episode entry per series, search hits, the member list, an `image/jpeg` poster, and a deep link of the form `<url>/web/index.html#/details?id=<32 hex>&serverId=<32 hex>`. Skip this step when no server is available and say so in the report.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: fill member emails on sync, add provider badge to the members list" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Report (do not push)**

Report the commit list, the test totals versus the baseline (only the pre-existing `dashboard-stats` failure remains), the `next build` result and the smoke-test output (titles only, no secrets). Do not push and do not open a PR unless the user asks; when they do, the PR targets `feat/media-server-abstraction` (PR #3 is not merged yet) and is retargeted to `main` after #3 merges. No tag and no GitHub Release until sub-project 3 ships.
