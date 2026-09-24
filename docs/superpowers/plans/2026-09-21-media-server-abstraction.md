# Media-server abstraction (Jellyfin sub-project 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put Plex behind a `MediaServer` interface and make identity `(provider, id)` everywhere (session, DB, tokens), with zero user-visible change and no Jellyfin code.

**Architecture:** New `src/lib/media/` holds the interface, the Plex adapter and a provider registry. Session JWT, unsubscribe tokens and the `users` / `newsletter_subscriptions` tables gain a `provider` dimension, with legacy sessions/tokens/rows still accepted. Every current caller of `lib/plex.ts` goes through the registry; the Edge middleware keeps a DB-free, config-free import graph.

**Tech Stack:** Next.js 14 (App Router, Edge middleware), TypeScript strict, better-sqlite3, jose, vitest.

**Spec:** `docs/superpowers/specs/2026-09-21-media-server-abstraction-design.md`

## Global Constraints

- **No Jellyfin code, no Jellyfin network call.** `ProviderId` includes `'jellyfin'` only so the type is ready for sub-project 2; nothing instantiates it.
- **No user-visible change.** All French UI strings, API response shapes and API error messages stay byte-identical (e.g. `'Failed to sync Plex users'`, `'Failed to search Plex library'`, `'Trop de tentatives, réessayez plus tard.'`).
- **Edge runtime:** `src/middleware.ts` and everything it transitively imports at runtime must not import `src/lib/config.ts`, `src/lib/db.ts`, `better-sqlite3`, `fs`, `path` or any `node:` module. Type-only imports (`import type`) are fine. Enforced by a test added in Task 5.
- **Legacy compatibility:** session JWTs `{ plexId, email, username, isOwner }` (no `provider`) and unsubscribe tokens `{ plexId }` must keep verifying, read as `provider: 'plex'`. Existing DB rows migrate to `provider = 'plex'`.
- **DB backup file:** exactly `<db path>.pre-provider-migration`, created once, just before the first migration (never for `:memory:`, never for a fresh DB).
- **Identity model:** two accounts on two providers are two distinct members. No email merging.
- **Known pre-existing failure:** `tests/api/dashboard-stats.test.ts` (`recentHistory` empty) fails on `main` before any change. Do not fix, do not count it as a regression.
- **Commits:** end every commit message with the trailer `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` (second `-m`). Work only on branch `feat/media-server-abstraction`; never push to `main`; do not push at all unless the user asks.
- **Working directory:** repo root of the feature-branch clone (the directory containing `package.json`). All paths below are relative to it.

## File Structure

New (all under `src/lib/media/`):

| File | Responsibility |
|---|---|
| `types.ts` | `ProviderId`, `MemberRef`, `MediaMember`, library item types, `MediaServer`, `PinAuth`, `PinResolution` |
| `plex.ts` | Low-level Plex API functions (moved from `src/lib/plex.ts`, behavior unchanged) |
| `plex-pin.ts` | `resolvePinToSession` (moved out of the `app/api/auth/poll` route folder) |
| `plex-provider.ts` | `createPlexProvider(cfg, fetchFn)` implementing `MediaServer` |
| `registry.ts` | `getActiveProviders`, `getProvider` |
| `aggregate.ts` | `searchAll`, `recentlyAddedAll`, `recentlyAddedSplitAll`, `listMembersAll` |
| `membership.ts` | `isStillMember(ref, env)` — the Edge-safe entry point used by the middleware |

This refines the spec's Structure section (which listed `types.ts`, `registry.ts`, `plex.ts`): splitting `plex.ts` / `plex-pin.ts` / `plex-provider.ts` avoids a circular import between the low-level functions and the adapter, and `aggregate.ts` / `membership.ts` keep single responsibilities.

Modified: `src/lib/session.ts`, `src/lib/newsletter-token.ts`, `src/lib/db.ts`, `src/lib/members.ts`, `src/lib/member-sync.ts` (function renamed `syncMembers`), `src/lib/newsletter-subscriptions.ts`, `src/lib/newsletter.ts`, `src/lib/config.ts`, `src/middleware.ts`, the auth / search / recently-added / members-sync / newsletter / subscription routes, `src/app/page.tsx`, `src/components/RecentlyAdded.tsx`, `src/components/GlobalSearch.tsx`, `src/components/AdminMembersList.tsx`, and the matching tests.

---

### Task 1: Move `lib/plex.ts` into `lib/media/` (mechanical)

**Files:**
- Move: `src/lib/plex.ts` → `src/lib/media/plex.ts`
- Modify: every importer of `lib/plex` in `src/` and `tests/`

**Interfaces:**
- Produces: `@/lib/media/plex` exporting exactly what `@/lib/plex` exported before (`createPin`, `pollPin`, `getPlexIdentity`, `getSharedUsers`, `isStillSharedUser`, `getRecentlyAdded`, `getRecentlyAddedSplit`, `searchLibrary`, `SESSION_REVALIDATION_TTL_MS`, and the types `PlexSharedUser`, `RecentlyAddedItem`, `RecentlyAddedSplit`, `SearchResultItem`). Later tasks rely on this path.

- [ ] **Step 1: Set up the clone and record the baseline**

```bash
git config user.name "titi69lpb" && git config user.email "user@example.com"
git checkout feat/media-server-abstraction
npm ci
npm run typecheck 2>&1 | tail -5
npx vitest run 2>&1 | tail -15
SESSION_SECRET=baseline-secret-0123456789abcdef0123456789 npm run build 2>&1 | tail -15
```

Expected baseline: `typecheck` clean; vitest shows exactly one failing test, in `tests/api/dashboard-stats.test.ts`; `build` succeeds. If the baseline differs, write the difference down in your report and compare against it in every later task instead of trying to fix it.

- [ ] **Step 2: Move the file and fix its relative imports**

```bash
mkdir -p src/lib/media
git mv src/lib/plex.ts src/lib/media/plex.ts
sed -i "s#from './fetch-timeout'#from '../fetch-timeout'#; s#from './ttl-cache'#from '../ttl-cache'#" src/lib/media/plex.ts
```

- [ ] **Step 3: Repoint every importer and test mock**

```bash
grep -rlE "lib/plex'|from './plex'" src tests | xargs sed -i -E "s#(@/lib|\.\./\.\./src/lib|\.\./src/lib)/plex'#\1/media/plex'#g; s#from './plex'#from './media/plex'#g"
grep -rnE "lib/plex'|from './plex'" src tests
```

Expected: the final `grep` prints nothing. (`src/lib/newsletter.ts` and `src/lib/member-sync.ts` use `'./plex'` and become `'./media/plex'`; `tests/api/admin-members-sync.test.ts` has `vi.mock` / `vi.importActual` / `import()` strings that are rewritten by the same command.)

- [ ] **Step 4: Verify nothing changed behaviorally**

```bash
npm run typecheck 2>&1 | tail -5
npx vitest run 2>&1 | tail -15
```

Expected: typecheck clean; the same single pre-existing failure as the baseline, nothing else.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: move lib/plex.ts to lib/media/plex.ts" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Provider-aware identity in session and tokens (legacy accepted)

Scope: in-memory identity only. The DB columns are still `plex_id` after this task; callers pass `userId` into them. Task 3 makes the DB provider-keyed.

**Files:**
- Create: `src/lib/media/types.ts`, `tests/lib/media/types.test.ts`
- Modify: `src/lib/session.ts`, `src/lib/newsletter-token.ts`, `src/lib/media/plex.ts`, `src/app/api/auth/poll/resolvePinToSession.ts`, `src/app/api/auth/poll/route.ts`, `src/lib/member-sync.ts`, `src/middleware.ts`, `src/app/api/newsletter/subscription/route.ts`, `src/app/api/newsletter/unsubscribe/route.ts`, `src/app/api/admin/newsletter/send/route.ts`
- Test: `tests/lib/session.test.ts`, `tests/lib/newsletter-token.test.ts` (rewritten), plus fixture updates in the other test files listed in Step 6

**Interfaces:**
- Produces (`src/lib/media/types.ts`):
  - `type ProviderId = 'plex' | 'jellyfin'`
  - `function isProviderId(value: unknown): value is ProviderId`
  - `interface MemberRef { provider: ProviderId; userId: string }`
  - `interface MediaMember extends MemberRef { email: string; username: string }`
- Produces: `SessionUser = { provider: ProviderId; userId: string; email: string; username: string; isOwner: boolean }`
- Produces: `signUnsubscribeToken(ref: MemberRef, secret: string): Promise<string>`; `verifyUnsubscribeToken(token: string, secret: string): Promise<MemberRef | null>`
- Produces: `getPlexIdentity(...)`, `getSharedUsers(...)` now return `MediaMember` / `MediaMember[]`; `isStillSharedUser(userId: string, serverToken: string, serverName: string, fetchFn?)`.

- [ ] **Step 1: Create the identity types and their test**

`src/lib/media/types.ts`:

```ts
export type ProviderId = 'plex' | 'jellyfin';

const PROVIDER_IDS: readonly string[] = ['plex', 'jellyfin'];

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && PROVIDER_IDS.includes(value);
}

/** Identity of one account on one media server. Two accounts on two
 * providers are two distinct members — there is deliberately no merging. */
export interface MemberRef {
  provider: ProviderId;
  userId: string;
}

export interface MediaMember extends MemberRef {
  email: string;
  username: string;
}
```

`tests/lib/media/types.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isProviderId } from '../../../src/lib/media/types';

describe('isProviderId', () => {
  it('accepts the known providers', () => {
    expect(isProviderId('plex')).toBe(true);
    expect(isProviderId('jellyfin')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isProviderId('emby')).toBe(false);
    expect(isProviderId('')).toBe(false);
    expect(isProviderId(undefined)).toBe(false);
    expect(isProviderId(42)).toBe(false);
  });
});
```

- [ ] **Step 2: Write the failing session and token tests (full file replacements)**

`tests/lib/session.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SignJWT } from 'jose';
import { createSession, verifySession } from '../../src/lib/session';

const SECRET = 'test-secret-at-least-32-characters-long';
const KEY = new TextEncoder().encode(SECRET);

async function signRaw(payload: Record<string, unknown>): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(KEY);
}

describe('session', () => {
  it('round-trips a valid session token', async () => {
    const user = { provider: 'plex' as const, userId: '123', email: 'a@b.com', username: 'alice', isOwner: false };
    const token = await createSession(user, SECRET);
    expect(await verifySession(token, SECRET)).toEqual(user);
  });

  it('round-trips isOwner: true', async () => {
    const user = { provider: 'plex' as const, userId: '1', email: 'owner@b.com', username: 'owner', isOwner: true };
    const token = await createSession(user, SECRET);
    expect(await verifySession(token, SECRET)).toEqual(user);
  });

  it('round-trips a jellyfin session', async () => {
    const user = { provider: 'jellyfin' as const, userId: 'abc-def', email: '', username: 'jelly', isOwner: false };
    const token = await createSession(user, SECRET);
    expect(await verifySession(token, SECRET)).toEqual(user);
  });

  it('rejects a token signed with a different secret', async () => {
    const user = { provider: 'plex' as const, userId: '123', email: 'a@b.com', username: 'alice', isOwner: false };
    const token = await createSession(user, SECRET);
    expect(await verifySession(token, 'a-completely-different-secret-value')).toBeNull();
  });

  it('rejects garbage input', async () => {
    expect(await verifySession('not-a-jwt', SECRET)).toBeNull();
  });

  it('rejects a payload missing isOwner (e.g. a token signed before this field existed)', async () => {
    const token = await signRaw({ plexId: '123', email: 'a@b.com', username: 'alice' });
    expect(await verifySession(token, SECRET)).toBeNull();
  });

  it('still accepts a legacy pre-provider session ({ plexId }) and reads it as plex', async () => {
    const token = await signRaw({ plexId: '123', email: 'a@b.com', username: 'alice', isOwner: false });
    expect(await verifySession(token, SECRET)).toEqual({
      provider: 'plex',
      userId: '123',
      email: 'a@b.com',
      username: 'alice',
      isOwner: false,
    });
  });

  it('rejects an unknown provider', async () => {
    const token = await signRaw({ provider: 'emby', userId: '1', email: 'a@b.com', username: 'a', isOwner: false });
    expect(await verifySession(token, SECRET)).toBeNull();
  });

  it('rejects a provider without a userId', async () => {
    const token = await signRaw({ provider: 'plex', email: 'a@b.com', username: 'a', isOwner: false });
    expect(await verifySession(token, SECRET)).toBeNull();
  });
});
```

`tests/lib/newsletter-token.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SignJWT } from 'jose';
import { signUnsubscribeToken, verifyUnsubscribeToken } from '../../src/lib/newsletter-token';

const SECRET = 'test-secret-at-least-32-characters-long';
const KEY = new TextEncoder().encode(SECRET);

describe('newsletter unsubscribe token', () => {
  it('round-trips a valid token', async () => {
    const ref = { provider: 'plex' as const, userId: 'plex-123' };
    const token = await signUnsubscribeToken(ref, SECRET);
    expect(await verifyUnsubscribeToken(token, SECRET)).toEqual(ref);
  });

  it('round-trips a jellyfin token', async () => {
    const ref = { provider: 'jellyfin' as const, userId: 'jf-9' };
    const token = await signUnsubscribeToken(ref, SECRET);
    expect(await verifyUnsubscribeToken(token, SECRET)).toEqual(ref);
  });

  it('still accepts a legacy token ({ plexId }) already sent by email, as plex', async () => {
    const legacy = await new SignJWT({ plexId: 'plex-123' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('90d')
      .sign(KEY);
    expect(await verifyUnsubscribeToken(legacy, SECRET)).toEqual({ provider: 'plex', userId: 'plex-123' });
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signUnsubscribeToken({ provider: 'plex', userId: 'plex-123' }, SECRET);
    expect(await verifyUnsubscribeToken(token, 'a-completely-different-secret-value')).toBeNull();
  });

  it('rejects garbage input', async () => {
    expect(await verifyUnsubscribeToken('not-a-jwt', SECRET)).toBeNull();
  });

  it('rejects an unknown provider', async () => {
    const token = await new SignJWT({ provider: 'emby', userId: '1' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('90d')
      .sign(KEY);
    expect(await verifyUnsubscribeToken(token, SECRET)).toBeNull();
  });

  it('rejects an expired token', async () => {
    const expiredToken = await new SignJWT({ plexId: 'plex-123' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 200 * 24 * 60 * 60)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 100 * 24 * 60 * 60)
      .sign(KEY);
    expect(await verifyUnsubscribeToken(expiredToken, SECRET)).toBeNull();
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run tests/lib/session.test.ts tests/lib/newsletter-token.test.ts tests/lib/media/types.test.ts`
Expected: `types.test.ts` passes; `session.test.ts` and `newsletter-token.test.ts` FAIL (new shape not implemented).

- [ ] **Step 4: Implement session and token changes (full file replacements)**

`src/lib/session.ts`:

```ts
import { SignJWT, jwtVerify } from 'jose';
import { isProviderId, type ProviderId } from './media/types';

export const SESSION_COOKIE_NAME = 'portal_session';
const SESSION_DURATION = '30d';

export interface SessionUser {
  provider: ProviderId;
  userId: string;
  email: string;
  username: string;
  isOwner: boolean;
}

export async function createSession(user: SessionUser, secret: string): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(SESSION_DURATION)
    .sign(key);
}

export async function verifySession(
  token: string,
  secret: string
): Promise<SessionUser | null> {
  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key);
    const { email, username, isOwner } = payload;
    if (typeof email !== 'string' || typeof username !== 'string' || typeof isOwner !== 'boolean') {
      return null;
    }
    if (isProviderId(payload.provider) && typeof payload.userId === 'string') {
      return { provider: payload.provider, userId: payload.userId, email, username, isOwner };
    }
    // Sessions signed before the provider dimension existed carry `plexId`
    // and no `provider` — only Plex existed then, so read them as plex. This
    // keeps 30-day cookies valid across the upgrade.
    if (payload.provider === undefined && typeof payload.plexId === 'string') {
      return { provider: 'plex', userId: payload.plexId, email, username, isOwner };
    }
    return null;
  } catch {
    return null;
  }
}
```

`src/lib/newsletter-token.ts`:

```ts
import { SignJWT, jwtVerify } from 'jose';
import { isProviderId, type MemberRef } from './media/types';

const TOKEN_DURATION = '90d';

export async function signUnsubscribeToken(ref: MemberRef, secret: string): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ provider: ref.provider, userId: ref.userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_DURATION)
    .sign(key);
}

export async function verifyUnsubscribeToken(token: string, secret: string): Promise<MemberRef | null> {
  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key);
    if (isProviderId(payload.provider) && typeof payload.userId === 'string') {
      return { provider: payload.provider, userId: payload.userId };
    }
    // Links already sitting in users' mailboxes (90-day tokens) were signed
    // with { plexId } before providers existed — keep them working as plex.
    if (payload.provider === undefined && typeof payload.plexId === 'string') {
      return { provider: 'plex', userId: payload.plexId };
    }
    return null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Convert the Plex identity types and their consumers**

In `src/lib/media/plex.ts`:

1. Add at the top: `import type { MediaMember } from './types';`
2. Delete the `export interface PlexSharedUser { ... }` block.
3. `getPlexIdentity`: change the return type to `Promise<MediaMember>` and the return statement to:
   `return { provider: 'plex', userId: String(data.id), email: data.email, username: data.username };`
4. `getSharedUsers`: change the return type to `Promise<MediaMember[]>`, `const result: PlexSharedUser[] = [];` to `const result: MediaMember[] = [];`, and the push to:

```ts
      result.push({
        provider: 'plex',
        userId: String(u.id),
        email: String(u.email ?? ''),
        username: String(u.username ?? ''),
      });
```
5. `fetchSharedUsersCached`: return type `Promise<MediaMember[]>`.
6. `isStillSharedUser`: rename the first parameter `plexId` to `userId` and the body line to `return shared.some((u) => u.userId === userId);`.

In `src/app/api/auth/poll/resolvePinToSession.ts`:

```ts
import { pollPin, getPlexIdentity, getSharedUsers } from '@/lib/media/plex';
import type { MediaMember } from '@/lib/media/types';

export type PollResult =
  | { status: 'pending' }
  | { status: 'denied' }
  | { status: 'ok'; user: MediaMember; isOwner: boolean };
```

and in the body replace `ownerIdentity.plexId === identity.plexId` with `ownerIdentity.userId === identity.userId`, and `sharedUsers.find((u) => u.plexId === identity.plexId)` with `sharedUsers.find((u) => u.userId === identity.userId)`. (Leave `PollDeps`, `defaultDeps` and the signature as they are.)

In `src/app/api/auth/poll/route.ts`: change the upsert `.run(result.user.plexId, ...)` to `.run(result.user.userId, ...)`. (`createSession({ ...result.user, isOwner: result.isOwner }, ...)` already compiles because `MediaMember` carries `provider`, `userId`, `email`, `username`.)

In `src/lib/member-sync.ts`: replace `import type { PlexSharedUser } from './media/plex';` with `import type { MediaMember } from './media/types';`, the parameter `plexUsers: PlexSharedUser[]` with `plexUsers: MediaMember[]`, and `u.plexId` (two places: `upsert.run(u.plexId, ...)` and `existingIds.has(u.plexId)`) with `u.userId`.

In `src/middleware.ts`: change the condition and call to

```ts
  if (sessionUser && !sessionUser.isOwner && sessionUser.provider === 'plex' && plexServerToken && plexServerName) {
    const stillShared = await isStillSharedUser(sessionUser.userId, plexServerToken, plexServerName);
```

In `src/app/api/newsletter/subscription/route.ts`: `sessionUser.plexId` becomes `sessionUser.userId` (two places).

In `src/app/api/newsletter/unsubscribe/route.ts` (two handlers): replace

```ts
    const plexId = await verifyUnsubscribeToken(token, config.session.secret);
    if (!plexId) {
```
with
```ts
    const ref = await verifyUnsubscribeToken(token, config.session.secret);
    if (!ref) {
```
and in the POST handler `setSubscribed(db, plexId, false);` with `setSubscribed(db, ref.userId, false);`.

In `src/app/api/admin/newsletter/send/route.ts`: `signUnsubscribeToken(recipient.plex_id, config.session.secret)` becomes `signUnsubscribeToken({ provider: 'plex', userId: recipient.plex_id }, config.session.secret)`.

- [ ] **Step 6: Update the fixtures in the other tests**

Session-user and Plex-member fixtures all use the literal form `plexId: '<value>'`. Convert them (these files only; `session.test.ts`, `newsletter-token.test.ts` were already rewritten, and `members.test.ts` is handled in Task 3):

```bash
sed -i -E "s/plexId: '([^']*)'/provider: 'plex', userId: '\1'/g" \
  tests/middleware.test.ts tests/lib/route-auth.test.ts tests/lib/member-sync.test.ts tests/lib/plex.test.ts \
  tests/api/search.test.ts tests/api/newsletter-subscription.test.ts tests/api/history.test.ts \
  tests/api/dashboard-stats.test.ts tests/api/dashboard-announcement.test.ts tests/api/auth.test.ts \
  tests/api/admin-settings-step.test.ts tests/api/admin-newsletter-send.test.ts \
  tests/api/admin-members-sync.test.ts tests/api/admin-mail.test.ts \
  tests/api/admin-mail-templates.test.ts tests/api/admin-announcements.test.ts
sed -i -E "s/\.plexId\b/.userId/g" tests/lib/plex.test.ts tests/api/auth.test.ts
```

Then fix by hand:

- `tests/middleware.test.ts` line ~109: the parameter type `user: { plexId: string; email: string; ... }` becomes `user: { provider: 'plex'; userId: string; email: string; username: string; isOwner: boolean }`. The top-level `const USER = { provider: 'plex', ... }` must become `provider: 'plex' as const` (an untyped const widens the literal to `string`, which `SessionUser` rejects); apply the same `as const` to any other untyped fixture `tsc` flags.
- `tests/lib/member-sync.test.ts`: the type import `PlexSharedUser` (from `../../src/lib/media/plex`) becomes `MediaMember` (from `../../src/lib/media/types`) and the annotation `PlexSharedUser[]` becomes `MediaMember[]`.
- `tests/lib/plex.test.ts`: `getPlexIdentity` / `getSharedUsers` expectations now read `{ provider: 'plex', userId: ..., email: ..., username: ... }` (the `sed` converted the literal form; add `provider: 'plex'` wherever an expectation lists `userId` without it). `isStillSharedUser` calls keep their positional arguments unchanged.
- `tests/api/auth.test.ts`: the identity mocks converted by the `sed` now include `provider: 'plex'` and satisfy `MediaMember`.

- [ ] **Step 7: Run typecheck and the whole suite**

```bash
npm run typecheck 2>&1 | tail -20
npx vitest run 2>&1 | tail -20
```

Expected: typecheck clean. Vitest: everything green except the one pre-existing `dashboard-stats` failure. If typecheck lists remaining `plexId` uses, apply the same rule (`provider: 'plex', userId: ...` for fixtures, `.userId` for property reads) and rerun.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: carry provider in session, tokens and Plex identities" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Provider-keyed database (migration, backup, queries)

**Files:**
- Modify: `src/lib/db.ts`, `src/lib/newsletter-subscriptions.ts`, `src/lib/members.ts`, `src/lib/member-sync.ts`, `src/app/api/auth/poll/route.ts`, `src/app/api/admin/newsletter/send/route.ts`, `src/app/api/admin/members/sync/route.ts`, `src/app/api/newsletter/subscription/route.ts`, `src/app/api/newsletter/unsubscribe/route.ts`, `src/components/AdminMembersList.tsx`
- Test: `tests/lib/db-migration.test.ts` (new), `tests/lib/db.test.ts`, `tests/lib/newsletter-subscriptions.test.ts`, `tests/lib/members.test.ts`, `tests/lib/member-sync.test.ts`, `tests/lib/mail-recipients.test.ts`, `tests/api/admin-newsletter-send.test.ts`, `tests/api/admin-mail.test.ts`, `tests/api/admin-members-sync.test.ts`

**Interfaces:**
- Consumes: `MemberRef`, `MediaMember`, `ProviderId` from `src/lib/media/types.ts` (Task 2).
- Produces: tables `users(provider, external_id, email, username, last_login, PRIMARY KEY(provider, external_id))` and `newsletter_subscriptions(provider, external_id, opted_in, updated_at, PRIMARY KEY(provider, external_id))`.
- Produces: `isSubscribed(db, ref: MemberRef): boolean`; `setSubscribed(db, ref: MemberRef, subscribed: boolean): void`.
- Produces: `PortalUser = { provider: ProviderId; userId: string; username: string; email: string; lastLogin: string }`; `MemberOverview = { provider: ProviderId; userId: string; username: string; email: string; portalLastLogin: string; tautulliLastSeen: string | null; newsletterOptedIn: boolean }`.
- Produces: `syncMembers(db, members: MediaMember[]): SyncResult` (renamed from `syncPlexUsers`).
- Produces: `LEGACY_BACKUP_SUFFIX = '.pre-provider-migration'` exported from `src/lib/db.ts`.

- [ ] **Step 1: Write the failing migration tests**

`tests/lib/db-migration.test.ts`:

```ts
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getDb, resetDbForTests, LEGACY_BACKUP_SUFFIX } from '../../src/lib/db';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'portarr-migration-'));
});

afterEach(() => {
  resetDbForTests();
  rmSync(dir, { recursive: true, force: true });
});

function makeLegacyDb(): string {
  const path = join(dir, 'portal.db');
  const legacy = new Database(path);
  legacy.pragma('journal_mode = WAL');
  legacy.exec(`
    CREATE TABLE users (
      plex_id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      username TEXT NOT NULL,
      last_login TEXT NOT NULL
    );
    CREATE TABLE newsletter_subscriptions (
      plex_id TEXT PRIMARY KEY,
      opted_in INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );
  `);
  legacy
    .prepare('INSERT INTO users (plex_id, email, username, last_login) VALUES (?, ?, ?, ?)')
    .run('42', 'a@b.com', 'alice', '2026-01-01T00:00:00.000Z');
  legacy
    .prepare('INSERT INTO newsletter_subscriptions (plex_id, opted_in, updated_at) VALUES (?, ?, ?)')
    .run('42', 0, '2026-01-02T00:00:00.000Z');
  legacy.close();
  return path;
}

describe('provider-keyed migration', () => {
  it('migrates legacy users to provider plex, keeping every column', () => {
    const db = getDb(makeLegacyDb());
    const rows = db
      .prepare('SELECT provider, external_id, email, username, last_login FROM users')
      .all();
    expect(rows).toEqual([
      { provider: 'plex', external_id: '42', email: 'a@b.com', username: 'alice', last_login: '2026-01-01T00:00:00.000Z' },
    ]);
  });

  it('migrates legacy subscriptions and preserves opted_in', () => {
    const db = getDb(makeLegacyDb());
    const rows = db
      .prepare('SELECT provider, external_id, opted_in, updated_at FROM newsletter_subscriptions')
      .all();
    expect(rows).toEqual([
      { provider: 'plex', external_id: '42', opted_in: 0, updated_at: '2026-01-02T00:00:00.000Z' },
    ]);
  });

  it('leaves no legacy tables behind', () => {
    const db = getDb(makeLegacyDb());
    const leftovers = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%_legacy'")
      .all();
    expect(leftovers).toEqual([]);
  });

  it('writes the pre-migration backup, containing the legacy schema and data', () => {
    const path = makeLegacyDb();
    getDb(path);
    const backupPath = `${path}${LEGACY_BACKUP_SUFFIX}`;
    expect(existsSync(backupPath)).toBe(true);
    const backup = new Database(backupPath, { readonly: true });
    const rows = backup.prepare('SELECT plex_id, email FROM users').all();
    backup.close();
    expect(rows).toEqual([{ plex_id: '42', email: 'a@b.com' }]);
  });

  it('is idempotent: reopening keeps the data and does not overwrite the backup', () => {
    const path = makeLegacyDb();
    const first = getDb(path);
    first
      .prepare("INSERT INTO users (provider, external_id, email, username, last_login) VALUES ('plex', '43', 'c@d.com', 'carol', '')")
      .run();
    resetDbForTests();

    const second = getDb(path);
    const ids = second.prepare('SELECT external_id FROM users ORDER BY external_id').all();
    expect(ids).toEqual([{ external_id: '42' }, { external_id: '43' }]);

    const backup = new Database(`${path}${LEGACY_BACKUP_SUFFIX}`, { readonly: true });
    const backupRows = backup.prepare('SELECT plex_id FROM users').all();
    backup.close();
    expect(backupRows).toEqual([{ plex_id: '42' }]);
  });

  it('creates the new schema directly on a fresh database, with no backup', () => {
    const path = join(dir, 'fresh.db');
    const db = getDb(path);
    const cols = (db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).map((c) => c.name);
    expect(cols).toEqual(['provider', 'external_id', 'email', 'username', 'last_login']);
    expect(existsSync(`${path}${LEGACY_BACKUP_SUFFIX}`)).toBe(false);
  });

  it('allows the same external_id under two different providers, but not twice under one', () => {
    const db = getDb(join(dir, 'fresh.db'));
    const insert = db.prepare(
      'INSERT INTO users (provider, external_id, email, username, last_login) VALUES (?, ?, ?, ?, ?)'
    );
    insert.run('plex', '7', 'a@b.com', 'a', '');
    insert.run('jellyfin', '7', 'a@b.com', 'a', '');
    expect(() => insert.run('plex', '7', 'x@y.com', 'x', '')).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/lib/db-migration.test.ts`
Expected: FAIL (`LEGACY_BACKUP_SUFFIX` is not exported, schema still `plex_id`).

- [ ] **Step 3: Implement the schema and migration in `src/lib/db.ts`**

Replace the `users` and `newsletter_subscriptions` definitions inside `SCHEMA`:

```sql
CREATE TABLE IF NOT EXISTS users (
  provider TEXT NOT NULL,
  external_id TEXT NOT NULL,
  email TEXT NOT NULL,
  username TEXT NOT NULL,
  last_login TEXT NOT NULL,
  PRIMARY KEY (provider, external_id)
);
```

```sql
CREATE TABLE IF NOT EXISTS newsletter_subscriptions (
  provider TEXT NOT NULL,
  external_id TEXT NOT NULL,
  opted_in INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (provider, external_id)
);
```

Add the import `import { existsSync, mkdirSync } from 'node:fs';` (replacing the current `mkdirSync`-only import), and, between the `SCHEMA` constant and `getDb`:

```ts
export const LEGACY_BACKUP_SUFFIX = '.pre-provider-migration';

function tableHasColumn(db: Database.Database, table: string, column: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return columns.some((c) => c.name === column);
}

// SQLite cannot alter a primary key, so moving `users` and
// `newsletter_subscriptions` from `plex_id` to (provider, external_id) means
// rename -> create new -> copy -> drop, inside one transaction. Guarded by
// the presence of the legacy `plex_id` column, so it is a no-op on fresh and
// already-migrated databases. An older Portarr image cannot read the new
// schema, so a copy of the database is taken first (once) as the rollback.
function migrateToProviderKeys(db: Database.Database, dbPath: string): void {
  const usersLegacy = tableHasColumn(db, 'users', 'plex_id');
  const subsLegacy = tableHasColumn(db, 'newsletter_subscriptions', 'plex_id');
  if (!usersLegacy && !subsLegacy) return;

  if (dbPath !== ':memory:') {
    const backupPath = `${dbPath}${LEGACY_BACKUP_SUFFIX}`;
    if (!existsSync(backupPath)) {
      // VACUUM INTO writes a consistent copy even in WAL mode; it cannot run
      // inside a transaction, hence before db.transaction() below.
      db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
    }
  }

  db.transaction(() => {
    if (usersLegacy) db.exec('ALTER TABLE users RENAME TO users_legacy');
    if (subsLegacy) db.exec('ALTER TABLE newsletter_subscriptions RENAME TO newsletter_subscriptions_legacy');
    db.exec(SCHEMA);
    if (usersLegacy) {
      db.exec(
        `INSERT INTO users (provider, external_id, email, username, last_login)
         SELECT 'plex', plex_id, email, username, last_login FROM users_legacy`
      );
      db.exec('DROP TABLE users_legacy');
    }
    if (subsLegacy) {
      db.exec(
        `INSERT INTO newsletter_subscriptions (provider, external_id, opted_in, updated_at)
         SELECT 'plex', plex_id, opted_in, updated_at FROM newsletter_subscriptions_legacy`
      );
      db.exec('DROP TABLE newsletter_subscriptions_legacy');
    }
  })();
}
```

In `getDb`, change

```ts
  instance.pragma('journal_mode = WAL');
  instance.exec(SCHEMA);
```
to
```ts
  instance.pragma('journal_mode = WAL');
  migrateToProviderKeys(instance, resolvedPath);
  instance.exec(SCHEMA);
```

- [ ] **Step 4: Run to verify the migration tests pass**

Run: `npx vitest run tests/lib/db-migration.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Convert the DB-facing library code (full replacements)**

`src/lib/newsletter-subscriptions.ts`:

```ts
import type Database from 'better-sqlite3';
import type { MemberRef } from './media/types';

export function isSubscribed(db: Database.Database, ref: MemberRef): boolean {
  const row = db
    .prepare('SELECT opted_in FROM newsletter_subscriptions WHERE provider = ? AND external_id = ?')
    .get(ref.provider, ref.userId) as { opted_in: number } | undefined;
  return row ? row.opted_in === 1 : true;
}

export function setSubscribed(db: Database.Database, ref: MemberRef, subscribed: boolean): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO newsletter_subscriptions (provider, external_id, opted_in, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(provider, external_id) DO UPDATE SET opted_in = excluded.opted_in, updated_at = excluded.updated_at`
  ).run(ref.provider, ref.userId, subscribed ? 1 : 0, now);
}
```

`src/lib/members.ts`:

```ts
import type Database from 'better-sqlite3';
import { getUserActivity } from './tautulli';
import { isSubscribed } from './newsletter-subscriptions';
import type { ProviderId } from './media/types';

export interface MemberOverview {
  provider: ProviderId;
  userId: string;
  username: string;
  email: string;
  portalLastLogin: string;
  tautulliLastSeen: string | null;
  newsletterOptedIn: boolean;
}

interface UserRow {
  provider: ProviderId;
  external_id: string;
  username: string;
  email: string;
  last_login: string;
}

export interface PortalUser {
  provider: ProviderId;
  userId: string;
  username: string;
  email: string;
  lastLogin: string;
}

// Plain DB read, no Tautulli round-trip — for callers that only need the
// email/username pairs (e.g. the mailing target picker), not the full
// activity-cross-referenced overview. getMemberOverview below builds on this
// rather than duplicating the query.
export function listUsers(db: Database.Database): PortalUser[] {
  const users = db
    .prepare('SELECT provider, external_id, username, email, last_login FROM users ORDER BY last_login DESC')
    .all() as UserRow[];
  return users.map((u) => ({
    provider: u.provider,
    userId: u.external_id,
    username: u.username,
    email: u.email,
    lastLogin: u.last_login,
  }));
}

export async function getMemberOverview(
  db: Database.Database,
  tautulliUrl: string,
  tautulliApiKey: string
): Promise<MemberOverview[]> {
  const users = listUsers(db);

  let activityByEmail = new Map<string, Date | null>();
  try {
    const activity = await getUserActivity(tautulliUrl, tautulliApiKey);
    activityByEmail = new Map(activity.map((a) => [a.email, a.lastSeenAt]));
  } catch (err) {
    console.error('Failed to fetch Tautulli activity for member overview:', err);
  }

  return users.map((u) => {
    const lastSeen = activityByEmail.get(u.email.toLowerCase()) ?? null;
    return {
      provider: u.provider,
      userId: u.userId,
      username: u.username,
      email: u.email,
      portalLastLogin: u.lastLogin,
      tautulliLastSeen: lastSeen ? lastSeen.toISOString() : null,
      newsletterOptedIn: isSubscribed(db, { provider: u.provider, userId: u.userId }),
    };
  });
}
```

`src/lib/member-sync.ts`:

```ts
import type Database from 'better-sqlite3';
import type { MediaMember } from './media/types';

export interface SyncResult {
  added: number;
  updated: number;
  skippedNoEmail: number;
  total: number;
}

// Upserts every provider member into the same `users` table portal logins
// populate, so the existing mailing targeting (broadcast, individual
// selection, activeSince/neverActive groups) immediately covers the whole
// community — not just whoever has already logged into the portal.
// A never-logged-in user gets last_login = '' (the column is NOT NULL);
// every existing consumer of last_login (AdminMembersList's formatDate,
// getMemberOverview) already treats a falsy value as "no login yet", so
// this needs no changes elsewhere. Sync never overwrites a real last_login.
export function syncMembers(db: Database.Database, members: MediaMember[]): SyncResult {
  const withEmail = members.filter((m) => m.email);
  const skippedNoEmail = members.length - withEmail.length;

  const existing = new Set(
    (db.prepare('SELECT provider, external_id FROM users').all() as { provider: string; external_id: string }[]).map(
      (r) => `${r.provider}:${r.external_id}`
    )
  );

  const upsert = db.prepare(
    `INSERT INTO users (provider, external_id, email, username, last_login) VALUES (?, ?, ?, ?, '')
     ON CONFLICT(provider, external_id) DO UPDATE SET email = excluded.email, username = excluded.username`
  );

  let added = 0;
  let updated = 0;
  for (const m of withEmail) {
    upsert.run(m.provider, m.userId, m.email, m.username);
    if (existing.has(`${m.provider}:${m.userId}`)) {
      updated += 1;
    } else {
      added += 1;
    }
  }

  return { added, updated, skippedNoEmail, total: withEmail.length };
}
```

- [ ] **Step 6: Convert the routes and the members table**

`src/app/api/auth/poll/route.ts` — replace the upsert with:

```ts
    db.prepare(
      `INSERT INTO users (provider, external_id, email, username, last_login) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(provider, external_id) DO UPDATE SET email = excluded.email, username = excluded.username, last_login = excluded.last_login`
    ).run(result.user.provider, result.user.userId, result.user.email, result.user.username, new Date().toISOString());
```

`src/app/api/admin/members/sync/route.ts` — import `syncMembers` instead of `syncPlexUsers` and call `syncMembers(db, plexUsers)`.

`src/app/api/newsletter/subscription/route.ts` — `isSubscribed(db, sessionUser.userId)` becomes `isSubscribed(db, { provider: sessionUser.provider, userId: sessionUser.userId })`, and `setSubscribed(db, sessionUser.userId, body.subscribed)` becomes `setSubscribed(db, { provider: sessionUser.provider, userId: sessionUser.userId }, body.subscribed)`.

`src/app/api/newsletter/unsubscribe/route.ts` — `setSubscribed(db, ref.userId, false)` becomes `setSubscribed(db, ref, false)`.

`src/app/api/admin/newsletter/send/route.ts`:

- `interface UserRow` becomes:
```ts
interface UserRow {
  provider: ProviderId;
  external_id: string;
  email: string;
  username: string;
}
```
  with `import type { ProviderId } from '@/lib/media/types';` added to the imports.
- the query becomes `.prepare('SELECT provider, external_id, email, username FROM users WHERE email != \'\'')`
- `isSubscribed(db, u.plex_id)` becomes `isSubscribed(db, { provider: u.provider, userId: u.external_id })`
- `signUnsubscribeToken({ provider: 'plex', userId: recipient.plex_id }, ...)` becomes `signUnsubscribeToken({ provider: recipient.provider, userId: recipient.external_id }, config.session.secret)`

`src/components/AdminMembersList.tsx` — `key={m.plexId}` becomes ``key={`${m.provider}:${m.userId}`}``.

- [ ] **Step 7: Update the existing tests**

```bash
sed -i "s/INSERT INTO users (plex_id, email, username, last_login) VALUES (?, ?, ?, ?)/INSERT INTO users (provider, external_id, email, username, last_login) VALUES ('plex', ?, ?, ?, ?)/g" \
  tests/lib/db.test.ts tests/lib/members.test.ts tests/lib/member-sync.test.ts tests/lib/mail-recipients.test.ts \
  tests/api/admin-newsletter-send.test.ts tests/api/admin-mail.test.ts
sed -i "s/WHERE plex_id = ?/WHERE provider = 'plex' AND external_id = ?/g" \
  tests/lib/db.test.ts tests/lib/member-sync.test.ts tests/lib/newsletter-subscriptions.test.ts
sed -i -E "s/plexId: '([^']*)'/provider: 'plex', userId: '\1'/g" tests/lib/members.test.ts
sed -i "s/syncPlexUsers/syncMembers/g" tests/lib/member-sync.test.ts
sed -i -E "s/isSubscribed\(db, '([^']*)'\)/isSubscribed(db, { provider: 'plex', userId: '\1' })/g; s/setSubscribed\(db, '([^']*)',/setSubscribed(db, { provider: 'plex', userId: '\1' },/g" tests/lib/newsletter-subscriptions.test.ts
```

Then by hand:

- `tests/api/admin-members-sync.test.ts` (~line 107): the query becomes `'SELECT external_id, last_login FROM users WHERE provider = \'plex\' ORDER BY external_id'` and the expected rows become `{ external_id: '10', last_login: '' }, { external_id: '11', last_login: '' }`.
- `tests/lib/members.test.ts`: any `expect(...)` that still mentions `plexId` on a `MemberOverview` / `PortalUser` is now `provider: 'plex', userId: ...` (the `sed` above converted the literal form).
- Add to `tests/lib/newsletter-subscriptions.test.ts`, inside the existing `describe`:

```ts
  it('keeps subscriptions of two providers with the same id independent', () => {
    const db = getDb(':memory:');
    setSubscribed(db, { provider: 'plex', userId: '7' }, false);
    expect(isSubscribed(db, { provider: 'plex', userId: '7' })).toBe(false);
    expect(isSubscribed(db, { provider: 'jellyfin', userId: '7' })).toBe(true);
  });
```
  (use the same `getDb` import and setup style as the surrounding tests in that file).
- Add to `tests/lib/member-sync.test.ts`, inside the existing `describe`:

```ts
  it('treats the same id on two providers as two members', () => {
    const db = getDb(':memory:');
    const result = syncMembers(db, [
      { provider: 'plex', userId: '1', email: 'a@b.com', username: 'alice' },
      { provider: 'jellyfin', userId: '1', email: 'a@b.com', username: 'alice' },
    ]);
    expect(result).toEqual({ added: 2, updated: 0, skippedNoEmail: 0, total: 2 });
  });
```

- [ ] **Step 8: Run typecheck and the whole suite**

```bash
npm run typecheck 2>&1 | tail -20
npx vitest run 2>&1 | tail -20
```

Expected: typecheck clean; everything green except the one pre-existing `dashboard-stats` failure. Any remaining `plex_id` in `src/` outside the comment/legacy code in `db.ts` is a miss: `grep -rn "plex_id" src | grep -v "src/lib/db.ts"` must print nothing.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: key users and newsletter subscriptions by (provider, external_id)" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: `MediaServer` interface, Plex adapter, registry, aggregation, membership

**Files:**
- Modify: `src/lib/media/types.ts` (append), `src/lib/media/plex.ts` (types moved out, `plexWebUrl` → `webUrl`), `src/components/RecentlyAdded.tsx`, `src/components/GlobalSearch.tsx`
- Move: `src/app/api/auth/poll/resolvePinToSession.ts` → `src/lib/media/plex-pin.ts`
- Create: `src/lib/media/plex-provider.ts`, `src/lib/media/registry.ts`, `src/lib/media/aggregate.ts`, `src/lib/media/membership.ts`
- Test: `tests/lib/media/fake-provider.ts` (helper), `tests/lib/media/plex-provider.test.ts`, `tests/lib/media/registry.test.ts`, `tests/lib/media/aggregate.test.ts`, `tests/lib/media/membership.test.ts`; fixture renames in existing tests

**Interfaces:**
- Consumes: `MediaMember`, `MemberRef`, `ProviderId` (Task 2); Plex functions from `src/lib/media/plex.ts` (Task 1).
- Produces (`types.ts`):
  ```ts
  interface RecentlyAddedItem { title: string; thumbPath: string; addedAt: string; type: 'movie' | 'episode'; webUrl: string | null }
  interface RecentlyAddedSplit { movies: RecentlyAddedItem[]; episodes: RecentlyAddedItem[] }
  interface SearchResultItem { title: string; year: number | null; type: 'movie' | 'show'; thumbPath: string | null; webUrl: string | null }
  type PinResolution = { status: 'pending' } | { status: 'denied' } | { status: 'ok'; user: MediaMember; isOwner: boolean }
  interface PinAuth { kind: 'pin'; createPin(): Promise<{ pinId: number; authUrl: string }>; resolvePin(pinId: number): Promise<PinResolution> }
  type ProviderAuth = PinAuth
  interface MediaServer {
    readonly id: ProviderId; readonly displayName: string; readonly auth: ProviderAuth;
    listMembers(): Promise<MediaMember[]>; isMember(userId: string): Promise<boolean>;
    recentlyAdded(count: number): Promise<RecentlyAddedItem[]>;
    recentlyAddedSplit(countPerType: number): Promise<RecentlyAddedSplit>;
    search(query: string): Promise<SearchResultItem[]>;
  }
  ```
- Produces: `createPlexProvider(cfg: PlexProviderConfig, fetchFn?: typeof fetch): MediaServer` with `PlexProviderConfig = { url: string; serverToken: string; serverName: string; clientIdentifier: string }`.
- Produces: `getActiveProviders(config: { plex: PlexProviderConfig | null; tautulli: object | null }, fetchFn?): MediaServer[]`; `getProvider(config, id: ProviderId, fetchFn?): MediaServer` (throws if not active).
- Produces: `searchAll(providers, query)`, `recentlyAddedAll(providers, count)`, `recentlyAddedSplitAll(providers, countPerType)`, `listMembersAll(providers)`.
- Produces: `isStillMember(ref: MemberRef, env: Record<string, string | undefined>, fetchFn?): Promise<boolean>`.
- Produces: `resolvePinToSession(pinId, deps, ctx)`, `PollDeps`, `defaultDeps` exported from `src/lib/media/plex-pin.ts` (same signatures as today).

- [ ] **Step 1: Append the interface and library types to `src/lib/media/types.ts`**

```ts
export interface RecentlyAddedItem {
  title: string;
  thumbPath: string;
  addedAt: string;
  type: 'movie' | 'episode';
  /** Deep link into this server's own web UI, or null if it could not be
   * built — callers must treat that as "not clickable" rather than link to
   * a broken URL. */
  webUrl: string | null;
}

export interface RecentlyAddedSplit {
  movies: RecentlyAddedItem[];
  episodes: RecentlyAddedItem[];
}

export interface SearchResultItem {
  title: string;
  year: number | null;
  type: 'movie' | 'show';
  thumbPath: string | null;
  /** Same contract as RecentlyAddedItem.webUrl. */
  webUrl: string | null;
}

export type PinResolution =
  | { status: 'pending' }
  | { status: 'denied' }
  | { status: 'ok'; user: MediaMember; isOwner: boolean };

export interface PinAuth {
  kind: 'pin';
  createPin(): Promise<{ pinId: number; authUrl: string }>;
  resolvePin(pinId: number): Promise<PinResolution>;
}

// Sub-project 2 widens this to `PinAuth | PasswordAuth`.
export type ProviderAuth = PinAuth;

export interface MediaServer {
  readonly id: ProviderId;
  readonly displayName: string;
  readonly auth: ProviderAuth;
  listMembers(): Promise<MediaMember[]>;
  /** Fails open (returns true) on an upstream error, so a hiccup never locks everyone out. */
  isMember(userId: string): Promise<boolean>;
  recentlyAdded(count: number): Promise<RecentlyAddedItem[]>;
  recentlyAddedSplit(countPerType: number): Promise<RecentlyAddedSplit>;
  search(query: string): Promise<SearchResultItem[]>;
}
```

- [ ] **Step 2: Move the library types out of `plex.ts` and rename `plexWebUrl` to `webUrl`**

In `src/lib/media/plex.ts`:

1. Delete the `export interface RecentlyAddedItem`, `export interface RecentlyAddedSplit` and `export interface SearchResultItem` blocks (including their doc comments).
2. Change the type import to `import type { MediaMember, RecentlyAddedItem, RecentlyAddedSplit, SearchResultItem } from './types';`.

Rename the field everywhere (`\b` keeps `buildPlexWebUrl` untouched):

```bash
grep -rlE "plexWebUrl" src tests | xargs sed -i -E "s/\bplexWebUrl\b/webUrl/g"
```

Repoint the type imports of the two components and any test:

```bash
sed -i "s#from '@/lib/media/plex'#from '@/lib/media/types'#" src/components/RecentlyAdded.tsx
grep -rn "RecentlyAddedItem\|RecentlyAddedSplit\|SearchResultItem" src tests | grep "media/plex"
```

Expected: the final `grep` shows `src/app/page.tsx` and `src/lib/newsletter.ts` (plus possibly a test). Split each import so `tsc` passes: keep the function import from the plex module and move the type to `types`:

- `src/app/page.tsx`: `import { getRecentlyAddedSplit } from '@/lib/media/plex';` and `import type { RecentlyAddedSplit } from '@/lib/media/types';`
- `src/lib/newsletter.ts`: `import { getRecentlyAdded } from './media/plex';` and `import type { RecentlyAddedItem } from './media/types';`
- any test importing these types from the plex module: same split.

(Task 6 rewrites both source files' imports again; this step only keeps the tree compiling.)

- [ ] **Step 3: Move `resolvePinToSession` next to the Plex code**

```bash
git mv src/app/api/auth/poll/resolvePinToSession.ts src/lib/media/plex-pin.ts
```

In `src/lib/media/plex-pin.ts` set the imports to relative form and reuse the shared type:

```ts
import { pollPin, getPlexIdentity, getSharedUsers } from './plex';
import type { PinResolution } from './types';

export type PollResult = PinResolution;
```

(delete the old local `PollResult` union and the old imports). Repoint its two importers:

```bash
sed -i "s#@/app/api/auth/poll/resolvePinToSession#@/lib/media/plex-pin#; s#\./resolvePinToSession#@/lib/media/plex-pin#" src/app/api/auth/poll/route.ts
sed -i "s#src/app/api/auth/poll/resolvePinToSession#src/lib/media/plex-pin#" tests/api/auth.test.ts
grep -rn "resolvePinToSession'" src tests
```

Expected: the final `grep` prints nothing.

- [ ] **Step 4: Write the shared test helper**

`tests/lib/media/fake-provider.ts`:

```ts
import type { MediaServer, ProviderId } from '../../../src/lib/media/types';

export function fakeProvider(id: ProviderId, overrides: Partial<MediaServer> = {}): MediaServer {
  return {
    id,
    displayName: id,
    auth: {
      kind: 'pin',
      createPin: async () => ({ pinId: 1, authUrl: 'https://example.test/auth' }),
      resolvePin: async () => ({ status: 'pending' }),
    },
    listMembers: async () => [],
    isMember: async () => true,
    recentlyAdded: async () => [],
    recentlyAddedSplit: async () => ({ movies: [], episodes: [] }),
    search: async () => [],
    ...overrides,
  };
}
```

- [ ] **Step 5: Write the failing tests for the adapter, registry, aggregation and membership**

`tests/lib/media/plex-provider.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPlexProvider } from '../../../src/lib/media/plex-provider';
import { resetTtlCacheForTests } from '../../../src/lib/ttl-cache';

const CFG = {
  url: 'http://plex.local:32400',
  serverToken: 'tok',
  serverName: 'MyPlex',
  clientIdentifier: 'cid',
};

beforeEach(() => {
  resetTtlCacheForTests();
});

function json(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as Response;
}

function xml(body: string): Response {
  return { ok: true, status: 200, text: async () => body } as Response;
}

const USERS_XML =
  '<MediaContainer><User id="5" email="a@b.com" username="al"><Server name="MyPlex"/></User></MediaContainer>';

function fetchStub(routes: Record<string, () => Response>): typeof fetch {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    const hit = Object.keys(routes).find((fragment) => url.includes(fragment));
    if (!hit) throw new Error(`unexpected fetch: ${url}`);
    return routes[hit]();
  }) as unknown as typeof fetch;
}

describe('createPlexProvider', () => {
  it('identifies itself as the plex pin-auth provider', () => {
    const p = createPlexProvider(CFG, fetchStub({}));
    expect(p.id).toBe('plex');
    expect(p.displayName).toBe('Plex');
    expect(p.auth.kind).toBe('pin');
  });

  it('createPin returns only pinId and authUrl', async () => {
    const p = createPlexProvider(CFG, fetchStub({ '/api/v2/pins': () => json({ id: 7, code: 'ABCD' }) }));
    expect(await p.auth.createPin()).toEqual({
      pinId: 7,
      authUrl: expect.stringContaining('code=ABCD'),
    });
  });

  it('listMembers returns provider-tagged members for this server only', async () => {
    const p = createPlexProvider(CFG, fetchStub({ 'plex.tv/api/users': () => xml(USERS_XML) }));
    expect(await p.listMembers()).toEqual([
      { provider: 'plex', userId: '5', email: 'a@b.com', username: 'al' },
    ]);
  });

  it('isMember is true for a shared user and false for a stranger', async () => {
    const p = createPlexProvider(CFG, fetchStub({ 'plex.tv/api/users': () => xml(USERS_XML) }));
    expect(await p.isMember('5')).toBe(true);
    expect(await p.isMember('6')).toBe(false);
  });

  it('isMember fails open when plex.tv is unreachable', async () => {
    const failing = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await createPlexProvider(CFG, failing).isMember('5')).toBe(true);
  });

  it('search returns library results with a web deep link', async () => {
    const p = createPlexProvider(
      CFG,
      fetchStub({
        '/hubs/search': () =>
          json({ MediaContainer: { Hub: [{ type: 'movie', Metadata: [{ title: 'Dune', year: 2021, thumb: '/t', ratingKey: '9' }] }] } }),
        '/identity': () => json({ MediaContainer: { machineIdentifier: 'MID' } }),
      })
    );
    expect(await p.search('dune')).toEqual([
      {
        title: 'Dune',
        year: 2021,
        type: 'movie',
        thumbPath: '/t',
        webUrl: expect.stringContaining('/web/index.html#!/server/MID/details'),
      },
    ]);
  });

  it('recentlyAddedSplit separates movies from episodes', async () => {
    const p = createPlexProvider(
      CFG,
      fetchStub({
        'type=1': () => json({ MediaContainer: { Metadata: [{ title: 'Dune', thumb: '/m', addedAt: 1700000000, ratingKey: '1' }] } }),
        'type=2': () =>
          json({
            MediaContainer: {
              Metadata: [
                { type: 'episode', grandparentTitle: 'Show', parentThumb: '/s', thumb: '/e', addedAt: 1700000100, parentRatingKey: '9', ratingKey: '10' },
              ],
            },
          }),
        '/identity': () => json({ MediaContainer: { machineIdentifier: 'MID' } }),
      })
    );
    const split = await p.recentlyAddedSplit(15);
    expect(split.movies.map((i) => i.title)).toEqual(['Dune']);
    expect(split.episodes.map((i) => i.title)).toEqual(['Show']);
  });
});
```

`tests/lib/media/registry.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getActiveProviders, getProvider } from '../../../src/lib/media/registry';

const PLEX = { url: 'http://plex', serverToken: 't', serverName: 'S', clientIdentifier: 'c' };
const TAUTULLI = { url: 'http://tautulli', apiKey: 'k' };

describe('getActiveProviders', () => {
  it('activates plex when plex and tautulli are both configured', () => {
    expect(getActiveProviders({ plex: PLEX, tautulli: TAUTULLI }).map((p) => p.id)).toEqual(['plex']);
  });

  it('activates nothing when plex is missing', () => {
    expect(getActiveProviders({ plex: null, tautulli: TAUTULLI })).toEqual([]);
  });

  it('activates nothing when tautulli is missing (activity still comes from Tautulli)', () => {
    expect(getActiveProviders({ plex: PLEX, tautulli: null })).toEqual([]);
  });
});

describe('getProvider', () => {
  it('returns the requested active provider', () => {
    expect(getProvider({ plex: PLEX, tautulli: TAUTULLI }, 'plex').id).toBe('plex');
  });

  it('throws when the provider is not active', () => {
    expect(() => getProvider({ plex: PLEX, tautulli: TAUTULLI }, 'jellyfin')).toThrow(/jellyfin/);
    expect(() => getProvider({ plex: null, tautulli: null }, 'plex')).toThrow(/plex/);
  });
});
```

`tests/lib/media/aggregate.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  searchAll,
  recentlyAddedAll,
  recentlyAddedSplitAll,
  listMembersAll,
} from '../../../src/lib/media/aggregate';
import type { RecentlyAddedItem } from '../../../src/lib/media/types';
import { fakeProvider } from './fake-provider';

afterEach(() => {
  vi.restoreAllMocks();
});

function item(title: string, addedAt: string, type: RecentlyAddedItem['type'] = 'movie'): RecentlyAddedItem {
  return { title, thumbPath: '/t', addedAt, type, webUrl: null };
}

describe('searchAll', () => {
  it('concatenates results in provider order', async () => {
    const a = fakeProvider('plex', { search: async () => [{ title: 'A', year: 1, type: 'movie', thumbPath: null, webUrl: null }] });
    const b = fakeProvider('jellyfin', { search: async () => [{ title: 'B', year: 2, type: 'show', thumbPath: null, webUrl: null }] });
    expect((await searchAll([a, b], 'x')).map((r) => r.title)).toEqual(['A', 'B']);
  });

  it('returns [] when there are no providers', async () => {
    expect(await searchAll([], 'x')).toEqual([]);
  });
});

describe('recentlyAddedAll', () => {
  it('merges by addedAt descending and slices to count', async () => {
    const a = fakeProvider('plex', { recentlyAdded: async () => [item('old', '2026-01-01T00:00:00.000Z'), item('new', '2026-03-01T00:00:00.000Z')] });
    const b = fakeProvider('jellyfin', { recentlyAdded: async () => [item('mid', '2026-02-01T00:00:00.000Z')] });
    expect((await recentlyAddedAll([a, b], 2)).map((i) => i.title)).toEqual(['new', 'mid']);
  });

  it('asks every provider for the full count', async () => {
    const spy = vi.fn(async () => []);
    await recentlyAddedAll([fakeProvider('plex', { recentlyAdded: spy })], 15);
    expect(spy).toHaveBeenCalledWith(15);
  });
});

describe('recentlyAddedSplitAll', () => {
  it('merges and slices movies and episodes independently', async () => {
    const a = fakeProvider('plex', {
      recentlyAddedSplit: async () => ({
        movies: [item('m-old', '2026-01-01T00:00:00.000Z')],
        episodes: [item('e1', '2026-01-05T00:00:00.000Z', 'episode')],
      }),
    });
    const b = fakeProvider('jellyfin', {
      recentlyAddedSplit: async () => ({
        movies: [item('m-new', '2026-02-01T00:00:00.000Z')],
        episodes: [item('e2', '2026-01-09T00:00:00.000Z', 'episode')],
      }),
    });
    const result = await recentlyAddedSplitAll([a, b], 1);
    expect(result.movies.map((i) => i.title)).toEqual(['m-new']);
    expect(result.episodes.map((i) => i.title)).toEqual(['e2']);
  });
});

describe('listMembersAll', () => {
  it('flattens members from every provider', async () => {
    const a = fakeProvider('plex', { listMembers: async () => [{ provider: 'plex', userId: '1', email: 'a@b.com', username: 'a' }] });
    const b = fakeProvider('jellyfin', { listMembers: async () => [{ provider: 'jellyfin', userId: '1', email: '', username: 'b' }] });
    expect((await listMembersAll([a, b])).map((m) => `${m.provider}:${m.userId}`)).toEqual(['plex:1', 'jellyfin:1']);
  });
});

describe('partial failure', () => {
  it('returns the healthy providers results when one provider fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const ok = fakeProvider('plex', { search: async () => [{ title: 'A', year: 1, type: 'movie', thumbPath: null, webUrl: null }] });
    const bad = fakeProvider('jellyfin', { search: async () => { throw new Error('down'); } });
    expect((await searchAll([ok, bad], 'x')).map((r) => r.title)).toEqual(['A']);
  });

  it('throws the first error when every provider fails, so the route can answer 502 as before', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const bad = fakeProvider('plex', { search: async () => { throw new Error('plex down'); } });
    await expect(searchAll([bad], 'x')).rejects.toThrow('plex down');
  });
});
```

`tests/lib/media/membership.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isStillMember } from '../../../src/lib/media/membership';
import { resetTtlCacheForTests } from '../../../src/lib/ttl-cache';

beforeEach(() => {
  resetTtlCacheForTests();
});

const USERS_XML =
  '<MediaContainer><User id="5" email="a@b.com" username="al"><Server name="MyPlex"/></User></MediaContainer>';

function usersFetch(): typeof fetch {
  return vi.fn(async () => ({ ok: true, status: 200, text: async () => USERS_XML }) as Response) as unknown as typeof fetch;
}

const ENV = { PLEX_SERVER_TOKEN: 'tok', PLEX_SERVER_NAME: 'MyPlex' };

describe('isStillMember', () => {
  it('confirms a plex user who is still shared', async () => {
    expect(await isStillMember({ provider: 'plex', userId: '5' }, ENV, usersFetch())).toBe(true);
  });

  it('rejects a plex user whose share was revoked', async () => {
    expect(await isStillMember({ provider: 'plex', userId: '99' }, ENV, usersFetch())).toBe(false);
  });

  it('skips revalidation (allows) when plex is not configured through env', async () => {
    const fetchFn = usersFetch();
    expect(await isStillMember({ provider: 'plex', userId: '99' }, {}, fetchFn)).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('allows a jellyfin ref until the jellyfin adapter exists', async () => {
    expect(await isStillMember({ provider: 'jellyfin', userId: 'x' }, ENV, usersFetch())).toBe(true);
  });
});
```

- [ ] **Step 6: Run to verify they fail**

Run: `npx vitest run tests/lib/media`
Expected: FAIL — `plex-provider`, `registry`, `aggregate`, `membership` modules do not exist.

- [ ] **Step 7: Implement the adapter, registry, aggregation and membership**

`src/lib/media/plex-provider.ts`:

```ts
import {
  createPin,
  pollPin,
  getPlexIdentity,
  getSharedUsers,
  isStillSharedUser,
  getRecentlyAdded,
  getRecentlyAddedSplit,
  searchLibrary,
} from './plex';
import { resolvePinToSession, type PollDeps } from './plex-pin';
import type { MediaServer } from './types';

// Structural on purpose (identical to config.ts's PlexConfig): this module is
// reachable from the Edge middleware and must never import config.ts.
export interface PlexProviderConfig {
  url: string;
  serverToken: string;
  serverName: string;
  clientIdentifier: string;
}

export function createPlexProvider(cfg: PlexProviderConfig, fetchFn: typeof fetch = fetch): MediaServer {
  const deps: PollDeps = {
    pollPin: (pinId, clientId) => pollPin(pinId, clientId, fetchFn),
    getPlexIdentity: (userToken, clientId) => getPlexIdentity(userToken, clientId, fetchFn),
    getSharedUsers: (serverToken, serverName) => getSharedUsers(serverToken, serverName, fetchFn),
  };

  return {
    id: 'plex',
    displayName: 'Plex',
    auth: {
      kind: 'pin',
      async createPin() {
        const { pinId, authUrl } = await createPin(cfg.clientIdentifier, fetchFn);
        return { pinId, authUrl };
      },
      resolvePin: (pinId) =>
        resolvePinToSession(pinId, deps, {
          clientIdentifier: cfg.clientIdentifier,
          serverToken: cfg.serverToken,
          serverName: cfg.serverName,
        }),
    },
    listMembers: () => getSharedUsers(cfg.serverToken, cfg.serverName, fetchFn),
    isMember: (userId) => isStillSharedUser(userId, cfg.serverToken, cfg.serverName, fetchFn),
    recentlyAdded: (count) => getRecentlyAdded(cfg.url, cfg.serverToken, count, fetchFn),
    recentlyAddedSplit: (countPerType) => getRecentlyAddedSplit(cfg.url, cfg.serverToken, countPerType, fetchFn),
    search: (query) => searchLibrary(cfg.url, cfg.serverToken, query, fetchFn),
  };
}
```

`src/lib/media/registry.ts`:

```ts
import { createPlexProvider, type PlexProviderConfig } from './plex-provider';
import type { MediaServer, ProviderId } from './types';

// Only the slices of AppConfig the registry needs, so it stays a plain
// import-free-of-config module (see the Edge runtime constraint).
export interface ProviderConfigSource {
  plex: PlexProviderConfig | null;
  tautulli: object | null;
}

// A provider is active when everything it needs is configured. Plex also
// needs Tautulli, because now-playing/stats/history still come from it.
export function getActiveProviders(config: ProviderConfigSource, fetchFn: typeof fetch = fetch): MediaServer[] {
  const providers: MediaServer[] = [];
  if (config.plex && config.tautulli) {
    providers.push(createPlexProvider(config.plex, fetchFn));
  }
  return providers;
}

export function getProvider(config: ProviderConfigSource, id: ProviderId, fetchFn: typeof fetch = fetch): MediaServer {
  const provider = getActiveProviders(config, fetchFn).find((p) => p.id === id);
  if (!provider) {
    throw new Error(`Media provider "${id}" is not active`);
  }
  return provider;
}
```

`src/lib/media/aggregate.ts`:

```ts
import type {
  MediaMember,
  MediaServer,
  RecentlyAddedItem,
  RecentlyAddedSplit,
  SearchResultItem,
} from './types';

// Runs `fn` on every provider. A failing provider is logged and skipped so
// one dead server never blanks the whole page; only when EVERY provider
// fails (and there was at least one) is the first error rethrown, so a
// single-provider install behaves exactly as before (route answers 502).
async function collect<T>(providers: MediaServer[], fn: (p: MediaServer) => Promise<T>): Promise<T[]> {
  const results = await Promise.allSettled(providers.map(fn));
  const ok: T[] = [];
  let failure: { reason: unknown } | null = null;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') {
      ok.push(r.value);
    } else {
      console.error(`Media provider "${providers[i].id}" failed:`, r.reason);
      failure ??= { reason: r.reason };
    }
  }
  if (ok.length === 0 && failure) throw failure.reason;
  return ok;
}

const byAddedAtDesc = (a: RecentlyAddedItem, b: RecentlyAddedItem) => Date.parse(b.addedAt) - Date.parse(a.addedAt);

export async function searchAll(providers: MediaServer[], query: string): Promise<SearchResultItem[]> {
  return (await collect(providers, (p) => p.search(query))).flat();
}

export async function recentlyAddedAll(providers: MediaServer[], count: number): Promise<RecentlyAddedItem[]> {
  const lists = await collect(providers, (p) => p.recentlyAdded(count));
  return lists.flat().sort(byAddedAtDesc).slice(0, count);
}

export async function recentlyAddedSplitAll(
  providers: MediaServer[],
  countPerType: number
): Promise<RecentlyAddedSplit> {
  const splits = await collect(providers, (p) => p.recentlyAddedSplit(countPerType));
  return {
    movies: splits.flatMap((s) => s.movies).sort(byAddedAtDesc).slice(0, countPerType),
    episodes: splits.flatMap((s) => s.episodes).sort(byAddedAtDesc).slice(0, countPerType),
  };
}

export async function listMembersAll(providers: MediaServer[]): Promise<MediaMember[]> {
  return (await collect(providers, (p) => p.listMembers())).flat();
}
```

`src/lib/media/membership.ts`:

```ts
import { createPlexProvider } from './plex-provider';
import type { MemberRef } from './types';

// The middleware's entry point for re-checking that a non-owner session is
// still a member of its media server. It runs on the Edge runtime, so it
// only ever reads credentials from env (never config.ts / the DB) and stays
// inside the DB-free import graph enforced by tests/middleware-edge-imports.
//
// Fails open — an install configured only via the DB/wizard has no env
// credentials here, so revalidation is skipped and the 30-day JWT expiry is
// the fallback (accepted, documented degradation).
export async function isStillMember(
  ref: MemberRef,
  env: Record<string, string | undefined>,
  fetchFn: typeof fetch = fetch
): Promise<boolean> {
  switch (ref.provider) {
    case 'plex': {
      const serverToken = env.PLEX_SERVER_TOKEN;
      const serverName = env.PLEX_SERVER_NAME;
      if (!serverToken || !serverName) return true;
      const plex = createPlexProvider(
        {
          url: env.PLEX_URL ?? '',
          serverToken,
          serverName,
          clientIdentifier: env.PLEX_CLIENT_IDENTIFIER ?? '',
        },
        fetchFn
      );
      return plex.isMember(ref.userId);
    }
    case 'jellyfin':
      // Sub-project 2 implements Jellyfin revalidation. No Jellyfin session
      // can exist before then.
      return true;
  }
}
```

- [ ] **Step 8: Run the new tests, then the whole suite**

```bash
npx vitest run tests/lib/media 2>&1 | tail -20
npm run typecheck 2>&1 | tail -20
npx vitest run 2>&1 | tail -20
```

Expected: the new tests PASS; typecheck clean; whole suite green except the pre-existing `dashboard-stats` failure. Fix any remaining `plexWebUrl`-related expectation in existing tests by the same rename rule.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add MediaServer interface, Plex adapter, registry and aggregation" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Route the auth path through the registry (login, poll, middleware) + Edge guard

**Files:**
- Modify: `src/app/api/auth/login/route.ts`, `src/app/api/auth/poll/route.ts`, `src/middleware.ts`, `src/lib/media/plex-pin.ts` (drop the now-unused `defaultDeps`)
- Create: `tests/middleware-edge-imports.test.ts`
- Test: `tests/api/auth.test.ts`, `tests/middleware.test.ts` (must keep passing unchanged in behavior)

**Interfaces:**
- Consumes: `getProvider(config, 'plex')`, `MediaServer.auth.createPin()` / `.resolvePin(pinId)`, `isStillMember(ref, env)`.

- [ ] **Step 1: Write the Edge import-graph guard (fails only if the constraint is broken)**

`tests/middleware-edge-imports.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src', import.meta.url));

// Next.js 14 middleware runs on the Edge runtime: it cannot bundle
// better-sqlite3 or touch the filesystem. Everything the middleware imports
// at runtime must therefore stay clear of config.ts / db.ts / node builtins.
const FORBIDDEN_FILES = ['lib/config.ts', 'lib/db.ts'];
const FORBIDDEN_EXTERNALS = ['better-sqlite3', 'fs', 'path', 'os', 'crypto', 'child_process'];

function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(from), spec);
  else return null;
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function walk(entry: string): { files: Set<string>; externals: Set<string> } {
  const files = new Set<string>();
  const externals = new Set<string>();
  const queue = [entry];
  // Runtime imports only: `import type` and `export type` are erased.
  const importRe = /^\s*(?:import|export)\s+(?!type\b)[^;]*?from\s+['"]([^'"]+)['"]/gm;
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (files.has(file)) continue;
    files.add(file);
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(importRe)) {
      const spec = match[1];
      const resolved = resolveImport(file, spec);
      if (resolved) queue.push(resolved);
      else if (!spec.startsWith('.') && !spec.startsWith('@/')) externals.add(spec.replace(/^node:/, ''));
    }
  }
  return { files, externals };
}

describe('middleware Edge import graph', () => {
  const { files, externals } = walk(join(SRC, 'middleware.ts'));

  it('never reaches config.ts or db.ts', () => {
    const reached = [...files].map((f) => relative(SRC, f));
    for (const forbidden of FORBIDDEN_FILES) {
      expect(reached).not.toContain(forbidden);
    }
  });

  it('never imports better-sqlite3 or a node builtin', () => {
    for (const forbidden of FORBIDDEN_EXTERNALS) {
      expect([...externals]).not.toContain(forbidden);
    }
  });

  it('actually walks the media modules (guards the guard)', () => {
    const reached = [...files].map((f) => relative(SRC, f));
    expect(reached).toContain('lib/session.ts');
  });
});
```

- [ ] **Step 2: Run it against the current middleware (it must already pass)**

Run: `npx vitest run tests/middleware-edge-imports.test.ts`
Expected: PASS (the current middleware imports `lib/session` and `lib/media/plex`, both Edge-safe). If it fails, the failure names the offending module: that is a real pre-existing violation — stop and report it instead of loosening the test.

- [ ] **Step 3: Route login and poll through the registry**

`src/app/api/auth/login/route.ts` — replace the `createPin` import with `import { getProvider } from '@/lib/media/registry';` and the body of the `try` block from `const { pinId, authUrl } = ...` with:

```ts
    const { pinId, authUrl } = await getProvider(config, 'plex').auth.createPin();
    return NextResponse.json({ pinId, authUrl });
```

(keep everything above it — rate limit, `loadConfig`, `isSetupComplete`, `assertConfigured` — untouched; the error messages and the comment about rate limiting stay as they are).

`src/app/api/auth/poll/route.ts` — remove the `resolvePinToSession, defaultDeps` import, add `import { getProvider } from '@/lib/media/registry';`, and replace the `resolvePinToSession(...)` call with:

```ts
    const result = await getProvider(config, 'plex').auth.resolvePin(pinId);
```

(the `if (result.status !== 'ok')` block, the `INSERT INTO users ...` upsert from Task 3 and `createSession({ ...result.user, isOwner: result.isOwner }, ...)` stay unchanged).

`src/lib/media/plex-pin.ts` — delete the `defaultDeps` export and its now-unused reference (keep `PollDeps` and `resolvePinToSession`; `plex-provider.ts` builds its own deps). Then `grep -rn "defaultDeps" src tests`; if `tests/api/auth.test.ts` imports it, replace that usage with an inline deps object of `vi.fn()` mocks (the test already builds its own deps for `resolvePinToSession`).

- [ ] **Step 4: Route the middleware through `isStillMember`**

In `src/middleware.ts`: replace `import { isStillSharedUser } from '@/lib/media/plex';` with `import { isStillMember } from '@/lib/media/membership';` and replace the whole revalidation block (from `const plexServerToken = ...` through the closing brace of `if (sessionUser && !sessionUser.isOwner && ...)`) with:

```ts
  // Re-check that a non-owner session is still a member of its media server.
  // isStillMember reads credentials from process.env only (never config.ts /
  // the DB — Edge runtime) and fails open on an upstream error, so a hiccup
  // never locks everyone out. An install configured only via the DB/wizard
  // skips this check and falls back to the plain 30-day JWT expiry — a
  // known, accepted degradation (see the admin-wizard spec's 2026-09-18
  // revision).
  if (sessionUser && !sessionUser.isOwner) {
    const stillMember = await isStillMember(sessionUser, process.env);
    if (!stillMember) {
      sessionUser = null;
    }
  }
```

Keep the block comment above `PUBLIC_PATHS` and everything else in the file as is.

- [ ] **Step 5: Run typecheck and the whole suite**

```bash
npm run typecheck 2>&1 | tail -20
npx vitest run 2>&1 | tail -20
```

Expected: typecheck clean; all green except the pre-existing `dashboard-stats` failure — in particular `tests/api/auth.test.ts`, `tests/middleware.test.ts` and `tests/middleware-edge-imports.test.ts` pass with unchanged behavior expectations.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: route login, poll and session revalidation through the media registry" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Route library and members paths through the registry

**Files:**
- Modify: `src/app/api/search/route.ts`, `src/app/api/dashboard/recently-added/route.ts`, `src/app/page.tsx`, `src/lib/newsletter.ts`, `src/app/api/admin/newsletter/send/route.ts`, `src/app/api/admin/members/sync/route.ts`
- Test: `tests/lib/newsletter.test.ts`, `tests/api/search.test.ts`, `tests/api/admin-members-sync.test.ts`, `tests/api/admin-newsletter-send.test.ts` (adapt to the new call shapes)

**Interfaces:**
- Consumes: `getActiveProviders`, `searchAll`, `recentlyAddedAll`, `recentlyAddedSplitAll`, `listMembersAll`, `createPlexProvider`.
- Produces: `getNewsletterItems(providers: MediaServer[], windowDays: number): Promise<NewsletterItems>`.

- [ ] **Step 1: Update `getNewsletterItems` (full replacement) and its tests first**

`src/lib/newsletter.ts`:

```ts
import { recentlyAddedAll } from './media/aggregate';
import type { MediaServer, RecentlyAddedItem } from './media/types';

export interface NewsletterItems {
  movies: RecentlyAddedItem[];
  episodes: RecentlyAddedItem[];
}

const FETCH_COUNT = 200;

export async function getNewsletterItems(
  providers: MediaServer[],
  windowDays: number
): Promise<NewsletterItems> {
  const items = await recentlyAddedAll(providers, FETCH_COUNT);
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const withinWindow = items.filter((item) => new Date(item.addedAt).getTime() >= cutoff);
  const withThumb = withinWindow.filter((item) => item.thumbPath && item.thumbPath !== 'undefined');

  return {
    movies: withThumb.filter((item) => item.type === 'movie'),
    episodes: withThumb.filter((item) => item.type === 'episode'),
  };
}
```

In `tests/lib/newsletter.test.ts`, add to the imports `import { createPlexProvider } from '../../src/lib/media/plex-provider';` and replace each call

```ts
await getNewsletterItems('https://plex.example.com', 'server-token', 6, fetchMock)
```
with
```ts
await getNewsletterItems(
  [createPlexProvider({ url: 'https://plex.example.com', serverToken: 'server-token', serverName: 'S', clientIdentifier: 'c' }, fetchMock)],
  6
)
```

Run: `npx vitest run tests/lib/newsletter.test.ts` — Expected: PASS.

- [ ] **Step 2: Convert the routes and the page**

`src/app/api/search/route.ts` — replace `import { searchLibrary } from '@/lib/media/plex';` with

```ts
import { getActiveProviders } from '@/lib/media/registry';
import { searchAll } from '@/lib/media/aggregate';
```
and `const results = await searchLibrary(config.plex.url, config.plex.serverToken, query);` with `const results = await searchAll(getActiveProviders(config), query);`.

`src/app/api/dashboard/recently-added/route.ts` — replace the import with the same two imports (`getActiveProviders`, `recentlyAddedAll`) and `getRecentlyAdded(config.plex.url, config.plex.serverToken, 15)` with `recentlyAddedAll(getActiveProviders(config), 15)`.

`src/app/page.tsx` — replace `import { getRecentlyAddedSplit } from '@/lib/media/plex';` (left by Task 4) with

```ts
import { getActiveProviders } from '@/lib/media/registry';
import { recentlyAddedSplitAll } from '@/lib/media/aggregate';
```
(the `import type { RecentlyAddedSplit } from '@/lib/media/types';` line from Task 4 stays) and `getRecentlyAddedSplit(config.plex.url, config.plex.serverToken, 15)` with `recentlyAddedSplitAll(getActiveProviders(config), 15)`.

`src/app/api/admin/newsletter/send/route.ts` — add `import { getActiveProviders } from '@/lib/media/registry';` and replace `getNewsletterItems(config.plex.url, config.plex.serverToken, WINDOW_DAYS)` with `getNewsletterItems(getActiveProviders(config), WINDOW_DAYS)`. (`config.plex.serverName` stays for the subject and template: naming a per-provider server in the newsletter is sub-project 2's concern.)

`src/app/api/admin/members/sync/route.ts` — replace `import { getSharedUsers } from '@/lib/media/plex';` with

```ts
import { getActiveProviders } from '@/lib/media/registry';
import { listMembersAll } from '@/lib/media/aggregate';
```
and

```ts
    const plexUsers = await getSharedUsers(config.plex.serverToken, config.plex.serverName);
    const db = getDb();
    const result = syncMembers(db, plexUsers);
```
with
```ts
    const members = await listMembersAll(getActiveProviders(config));
    const db = getDb();
    const result = syncMembers(db, members);
```
(the `catch` block, its `console.error` and the `'Failed to sync Plex users'` message stay unchanged).

- [ ] **Step 3: Adapt the affected tests**

The tests that mock the Plex module keep working because `plex-provider.ts` calls the same `./plex` module they mock (`vi.mock('../../src/lib/media/plex', ...)` after Task 1). Run them and fix only real breakage:

```bash
npm run typecheck 2>&1 | tail -20
npx vitest run tests/api/search.test.ts tests/api/admin-members-sync.test.ts tests/api/admin-newsletter-send.test.ts tests/api/dashboard-announcement.test.ts 2>&1 | tail -30
```

If `admin-members-sync.test.ts` mocks `getSharedUsers` with `vi.mock(... importActual ...)`, keep that (the adapter's `listMembers` goes through the mocked function). If a test asserted a call like `getSharedUsers` toHaveBeenCalledWith(token, name), it still holds: the adapter passes `(serverToken, serverName, fetchFn)` — loosen that single assertion with `expect.anything()` for the third argument.

- [ ] **Step 4: Run the whole suite**

Run: `npx vitest run 2>&1 | tail -20`
Expected: all green except the pre-existing `dashboard-stats` failure.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: route search, recently-added, newsletter and member sync through the registry" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: `isSetupComplete` via the registry + final verification

**Files:**
- Modify: `src/lib/config.ts`
- Test: `tests/lib/config.test.ts` (add cases)

**Interfaces:**
- Consumes: `getActiveProviders` (imports `type`-only shapes; `config.ts` → `registry.ts` → `plex-provider.ts` → `plex.ts`, and none of those import `config.ts`, so there is no runtime cycle).

- [ ] **Step 1: Write the failing test**

Append to `tests/lib/config.test.ts` (it already defines `FULL_ENV` and imports `getDb`, `resetDbForTests`, `loadConfig`, `isSetupComplete`, `beforeEach`; add `resetDbForTests()` in the new `describe`'s own `beforeEach` if the file's top-level one does not cover it):

```ts
describe('isSetupComplete — a media provider must be active', () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it('is false when Tautulli is missing (Plex alone is not an active provider)', () => {
    const { TAUTULLI_URL: _url, TAUTULLI_API_KEY: _key, ...env } = FULL_ENV;
    expect(isSetupComplete(loadConfig(env, getDb(':memory:')))).toBe(false);
  });

  it('is false when Plex is missing', () => {
    const { PLEX_URL: _url, ...env } = FULL_ENV;
    expect(isSetupComplete(loadConfig(env, getDb(':memory:')))).toBe(false);
  });

  it('is true when a provider is active and every other service is configured', () => {
    expect(isSetupComplete(loadConfig(FULL_ENV, getDb(':memory:')))).toBe(true);
  });
});
```

Run: `npx vitest run tests/lib/config.test.ts`. Expected: PASS already (behavior is unchanged with Plex only); this locks the contract before the refactor.

- [ ] **Step 2: Switch `isSetupComplete` to the registry**

In `src/lib/config.ts` add `import { getActiveProviders } from './media/registry';` and replace the first two conditions:

```ts
export function isSetupComplete(config: AppConfig): boolean {
  return (
    getActiveProviders(config).length > 0 &&
    config.sonarr !== null &&
    config.radarr !== null &&
    config.overseerr !== null &&
    config.smtp !== null &&
    config.publicBaseUrl !== null
  );
}
```

Leave `ConfiguredAppConfig` (`plex: PlexConfig; tautulli: TautulliConfig`) as is: with Plex the only provider, an active provider implies both are non-null. Sub-project 2 relaxes that narrowing when a Jellyfin-only install becomes possible. Add a one-line comment above `ConfiguredAppConfig`: `// plex/tautulli stay non-null here while Plex is the only provider; sub-project 2 (Jellyfin) relaxes this.`

- [ ] **Step 3: Full verification**

```bash
npm run typecheck 2>&1 | tail -10
npx vitest run 2>&1 | tail -20
SESSION_SECRET=verify-secret-0123456789abcdef0123456789 npm run build 2>&1 | tail -20
grep -rn "plexId\|plex_id\|plexWebUrl\|PlexSharedUser\|syncPlexUsers\|lib/plex'" src tests | grep -v "src/lib/db.ts" | grep -v "tests/lib/db-migration.test.ts" | grep -v "tests/lib/session.test.ts" | grep -v "tests/lib/newsletter-token.test.ts" | grep -v "src/lib/session.ts" | grep -v "src/lib/newsletter-token.ts"
```

Expected: typecheck clean; vitest green except the pre-existing `dashboard-stats` failure; `next build` succeeds (this is the real Edge-runtime check — a build error mentioning `node:crypto` / `node:fs` / `UnhandledSchemeError` means the middleware import graph regressed); the final `grep` prints nothing (the excluded files intentionally keep the legacy names for compatibility code and tests).

- [ ] **Step 4: Migration smoke test against a copy of a legacy database (manual)**

```bash
mkdir -p /tmp/portarr-migration-smoke && rm -f /tmp/portarr-migration-smoke/*
sqlite3 /tmp/portarr-migration-smoke/portal.db "CREATE TABLE users (plex_id TEXT PRIMARY KEY, email TEXT NOT NULL, username TEXT NOT NULL, last_login TEXT NOT NULL); INSERT INTO users VALUES ('1','a@b.com','alice','2026-01-01T00:00:00.000Z');"
DATABASE_PATH=/tmp/portarr-migration-smoke/portal.db npx tsx -e "import('./src/lib/db.ts').then(m => { const db = m.getDb(); console.log(db.prepare('SELECT provider, external_id, email FROM users').all()); })"
ls /tmp/portarr-migration-smoke
```

Expected: prints `[ { provider: 'plex', external_id: '1', email: 'a@b.com' } ]` and the directory lists `portal.db`, `portal.db.pre-provider-migration` (and WAL sidecar files). If `sqlite3` or `tsx` is unavailable, skip this step and rely on `tests/lib/db-migration.test.ts`, and say so in the report.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: derive setup completeness from active media providers" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Final report to the user (do not push)**

Report: task-by-task commit list, test totals versus the baseline (only the pre-existing `dashboard-stats` failure remains), `next build` result, and the migration smoke-test result. Do not push and do not open a PR unless the user asks; when they do, use `titi69lpb/portarr` from branch `feat/media-server-abstraction`, and do not tag (the release happens after sub-projects 2 and 3).
