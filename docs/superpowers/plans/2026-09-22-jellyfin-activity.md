# Jellyfin activity (sub-project 3a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Jellyfin members now-playing, personal stats, personal history and the Box Office widget — full parity via Jellystat, now-playing only via Jellyfin's native API — by putting all activity behind an `ActivitySource` interface, mirroring the `MediaServer` abstraction from sub-projects 1-2.

**Architecture:** New `src/lib/activity/` holds the interface, a Tautulli adapter (today's code, moved unchanged), a Jellystat adapter (new, full parity), and a native-Jellyfin adapter (new, now-playing only). A registry picks the active sources from config; an aggregator merges now-playing and Box Office across them. Every per-member call takes the whole member (`provider` + `id` + `email`) so Tautulli can keep matching by email while Jellystat matches by Jellyfin id directly.

**Tech Stack:** Next.js 14 (App Router), TypeScript strict, vitest.

**Spec:** `docs/superpowers/specs/2026-09-22-jellyfin-activity-design.md` (includes verified Jellystat API facts and the unverified-native-now-playing caveat).

## Global Constraints

- **Scope:** Jellyfin activity has two modes, chosen by `JELLYFIN_ACTIVITY_SOURCE` (`jellystat` | `native`, default `native`): Jellystat gives now-playing, personal stats, personal history and Box Office; native gives now-playing only, everything else empty. Plex/Tautulli behavior and every French string and JSON shape stay byte-identical when Jellyfin is not configured.
- **Identity:** every `ActivitySource` method that is about one member takes that member's `SessionUser` or `MediaMember` (both have `provider`, `userId`, `email`, `username` — structurally interchangeable) — never a bare id or a bare email.
- **Verified Jellystat facts (2026-09-22, Jellystat 1.1.12), do not re-derive:** auth header `x-api-token: <key>`; `GET /proxy/getSessions` returns Jellyfin's own raw `/Sessions` JSON verbatim (live, not cached by Jellystat); `GET /stats/getAllUserActivity` → `{UserId, UserName, LastActivityDate, TotalPlays, TotalWatchTime, ...}[]`; `POST /api/getUserHistory?size=&page=&sort=ActivityDateInserted&desc=true` body `{userid}` → `{current_page, pages, size, results: [...]}` with `NowPlayingItemName, SeriesName, SeasonId, EpisodeId, EpisodeNumber, SeasonNumber, FullName, ActivityDateInserted, PlaybackDuration, NowPlayingItemId`; `POST /stats/getMostViewedByType {days,type:'Movie'|'Series'}` → `{Name,Plays,Id}[]`; `POST /stats/getMostPopularByType` (same body) → `{Name,unique_viewers,Id}[]`; `POST /stats/getMostViewedLibraries {days}` → `{Name,Plays}[]`; `POST /stats/getMostActiveUsers {days}` → `{Name,Plays,UserId}[]`.
- **Native now-playing mapping is unverified against a live session** (nothing was playing during verification) — built from Jellyfin's documented `/Sessions` fields. Flag it in the task report; do not treat it as proven correct.
- **Edge runtime:** none of this plan's code is imported by `src/middleware.ts` — no Edge constraint applies here, unlike sub-projects 1-2.
- **Known pre-existing failure:** `tests/api/dashboard-stats.test.ts` (`recentHistory` empty) fails on `main` before any change in this plan. Do not fix it, do not count it as a regression.
- **Commits:** end every commit message with a second `-m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"`. Work only on branch `feat/jellyfin-activity` (already checked out, based directly on `main` — sub-projects 1-2 are merged, no stacking needed); never push and never touch `main` unless the user asks.
- **Working directory:** the repo root of the feature-branch clone (the directory containing `package.json`). All paths below are relative to it. If a test run leaves an untracked `data/` directory or a `*.pre-provider-migration*` file in the repo root, delete it before committing.
- **Public repo:** any test fixture built from real data seen during the spec's verification must use invented values (a fake username, a fake 32-hex id), never the real ones — same rule as sub-project 2.

## File Structure

New, under `src/lib/activity/` (parallel to `src/lib/media/`):

| File | Responsibility |
|---|---|
| `types.ts` | `ActiveSession`, `PersonalStats`, `PersonalStatsByType`, `RecentHistoryItem`, `WatchHistoryPage`, `GlobalStat`, `StatCategory`, the `ActivitySource` interface, `ActivityMember` (the shape every per-member call takes) |
| `tautulli-source.ts` | `src/lib/tautulli.ts` + `src/lib/activity.ts` moved here unchanged, wrapped as `createTautulliActivitySource` |
| `jellyfin-native-source.ts` | `createJellyfinNativeActivitySource` — now-playing only, via `media/jellyfin.ts`'s new `getSessions` |
| `jellystat.ts` | Low-level Jellystat API client (injected `fetchFn`, same shape as `media/jellyfin.ts`) |
| `jellystat-source.ts` | `createJellystatActivitySource`, full `ActivitySource` via `jellystat.ts` |
| `registry.ts` | `getActivitySources(config)`, `getActivitySourceFor(sources, provider)` |
| `aggregate.ts` | `nowPlayingAll`, `globalStatsAll` (fan-out tolerating one failing source) |

Modified: `src/lib/media/jellyfin.ts` (add `getSessions` + `JellyfinSession` + `normalizeJellyfinSessions`), `src/lib/config.ts`, `src/lib/settings-schema.ts`, `src/lib/connection-test.ts`, `src/lib/setup-steps.ts`, `src/lib/members.ts`, `src/lib/mail-recipients.ts` (import path only), `src/components/ServiceSettingsForm.tsx`, `src/components/SetupWizard.tsx`, `src/components/AdminSettingsPanel.tsx`, `src/components/AdminMembersList.tsx`, `src/components/StatsPersonal.tsx`, `src/components/StatsGlobal.tsx`, `src/components/StatCard.tsx`, `src/components/NowPlaying.tsx`, `src/components/HistoryLoadMore.tsx`, `src/app/page.tsx`, `src/app/history/page.tsx`, `src/app/admin/members/page.tsx`, `src/app/admin/settings/page.tsx`, `src/app/api/dashboard/now-playing/route.ts`, `src/app/api/dashboard/stats/route.ts`, `src/app/api/history/route.ts`, `.env.example`, `README.md`.

---

### Task 1: Move activity code into `lib/activity/`, define `ActivitySource`

Pure move + one new interface. No behavior change, no Jellyfin code.

**Files:**
- Create: `src/lib/activity/types.ts`
- Move: `src/lib/tautulli.ts` → `src/lib/activity/tautulli-source.ts`; `src/lib/activity.ts` content merges into the same file (its `ActiveSession`/`getActiveSessions` become part of the Tautulli source)
- Modify: every importer of `@/lib/tautulli` and `@/lib/activity`: `src/app/page.tsx`, `src/app/history/page.tsx`, `src/app/api/history/route.ts`, `src/app/api/dashboard/stats/route.ts`, `src/app/api/dashboard/now-playing/route.ts`, `src/components/StatsPersonal.tsx`, `src/components/StatsGlobal.tsx`, `src/components/StatCard.tsx`, `src/components/NowPlaying.tsx`, `src/components/HistoryLoadMore.tsx`, `src/lib/members.ts`, `src/lib/mail-recipients.ts`
- Test: `tests/lib/activity/tautulli-source.test.ts` (moved from `tests/lib/tautulli.test.ts` + `tests/lib/activity.test.ts`, merged)

**Interfaces:**
- Produces (`activity/types.ts`):
  ```ts
  export interface ActiveSession {
    title: string; showTitle: string | null; seasonNumber: number | null; episodeNumber: number | null;
    year: string; mediaType: 'movie' | 'episode' | 'track' | 'other'; user: string; player: string;
    bandwidthKbps: number; transcodeDecision: 'direct play' | 'copy' | 'transcode';
    viewOffsetMs: number; durationMs: number; state: 'playing' | 'paused' | 'buffering'; posterPath: string;
  }
  export interface PersonalStats { plays: number; totalDurationSeconds: number }
  export interface PersonalStatsByType { movies: { count: number; hours: number }; episodes: { count: number; hours: number } }
  export interface RecentHistoryItem { title: string; type: 'movie' | 'episode'; thumbPath: string; watchedAt: string }
  export interface WatchHistoryPage { items: RecentHistoryItem[]; total: number }
  export interface GlobalStat { title: string; value: number; posterPath?: string }
  export type StatCategory = 'topMovies' | 'popularMovies' | 'topTv' | 'popularTv' | 'topLibraries' | 'topUsers' | 'topPlatforms' | 'mostConcurrent'
  export const EMPTY_GLOBAL_STATS: Record<StatCategory, GlobalStat[]>
  /** Every field an ActivitySource needs to identify a member — SessionUser and MediaMember both satisfy this structurally. */
  export interface ActivityMember { provider: ProviderId; userId: string; email: string; username: string }
  export interface ActivitySource {
    readonly id: ProviderId;
    nowPlaying(): Promise<ActiveSession[]>;
    lastSeen(member: ActivityMember): Promise<string | null>;
    personalStats(member: ActivityMember): Promise<PersonalStats | null>;
    personalStatsByType(member: ActivityMember): Promise<PersonalStatsByType>;
    recentHistory(member: ActivityMember, limit: number): Promise<RecentHistoryItem[]>;
    historyPage(member: ActivityMember, offset: number, limit: number): Promise<WatchHistoryPage>;
    globalStats(): Promise<Record<StatCategory, GlobalStat[]>>;
  }
  ```
- Produces (`activity/tautulli-source.ts`): every current export of `lib/tautulli.ts` and `lib/activity.ts` (`getActiveSessions`, `ACTIVITY_TIMEOUT_MS`, `getPersonalStats`, `getUserIdByEmail`, `getUserActivity`, `getExtendedStats`, `getPersonalStatsByType`, `getRecentWatchHistory`, `balanceRecentHistory`, `getWatchHistoryPage`, plus the moved types now re-exported from `./types`), unchanged, PLUS `createTautulliActivitySource(cfg: { url: string; apiKey: string }, fetchFn?: typeof fetch): ActivitySource`.

- [ ] **Step 1: Move the files and fix internal imports**

```bash
mkdir -p src/lib/activity
git mv src/lib/tautulli.ts src/lib/activity/tautulli-source.ts
git rm src/lib/activity.ts
```

At the top of `src/lib/activity/tautulli-source.ts`, change `import { timeoutSignal } from './fetch-timeout';` to `import { timeoutSignal } from '../fetch-timeout';` and `import { withTtlCache, DEFAULT_CACHE_TTL_MS } from './ttl-cache';` to `import { withTtlCache, DEFAULT_CACHE_TTL_MS } from '../ttl-cache';`.

- [ ] **Step 2: Move the six moved types out into `activity/types.ts`, add the interface**

In `src/lib/activity/tautulli-source.ts`, delete these six blocks entirely: `export interface GlobalStat`, `export interface PersonalStats`, `export type StatCategory` (and its `STAT_ID_TO_CATEGORY`/`VALUE_FIELD_BY_CATEGORY`/`MEDIA_CATEGORIES` stay — those are Tautulli-internal, not the type declaration), `export interface PersonalStatsByType`, `export interface RecentHistoryItem`, `export interface WatchHistoryPage`. Also delete `export const ACTIVITY_TIMEOUT_MS = 12000;`'s co-located `export interface ActiveSession { ... }` block (the constant itself stays). Add at the very top of the file, after the two relative imports from Step 1:

```ts
import type { ActiveSession, ActivityMember, ActivitySource, GlobalStat, PersonalStats, PersonalStatsByType, RecentHistoryItem, StatCategory, WatchHistoryPage } from './types';
export type { ActiveSession, GlobalStat, PersonalStats, PersonalStatsByType, RecentHistoryItem, StatCategory, WatchHistoryPage } from './types';
```

Create `src/lib/activity/types.ts`:

```ts
import type { ProviderId } from '../media/types';

export const ACTIVITY_TIMEOUT_MS = 12000;

export interface ActiveSession {
  title: string;
  showTitle: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  year: string;
  mediaType: 'movie' | 'episode' | 'track' | 'other';
  user: string;
  player: string;
  bandwidthKbps: number;
  transcodeDecision: 'direct play' | 'copy' | 'transcode';
  viewOffsetMs: number;
  durationMs: number;
  state: 'playing' | 'paused' | 'buffering';
  posterPath: string;
}

export interface PersonalStats {
  plays: number;
  totalDurationSeconds: number;
}

export interface PersonalStatsByType {
  movies: { count: number; hours: number };
  episodes: { count: number; hours: number };
}

export interface RecentHistoryItem {
  title: string;
  type: 'movie' | 'episode';
  thumbPath: string;
  watchedAt: string;
}

export interface WatchHistoryPage {
  items: RecentHistoryItem[];
  total: number;
}

export interface GlobalStat {
  title: string;
  value: number;
  posterPath?: string;
}

export type StatCategory =
  | 'topMovies'
  | 'popularMovies'
  | 'topTv'
  | 'popularTv'
  | 'topLibraries'
  | 'topUsers'
  | 'topPlatforms'
  | 'mostConcurrent';

export const EMPTY_GLOBAL_STATS: Record<StatCategory, GlobalStat[]> = {
  topMovies: [],
  popularMovies: [],
  topTv: [],
  popularTv: [],
  topLibraries: [],
  topUsers: [],
  topPlatforms: [],
  mostConcurrent: [],
};

/** Every field an ActivitySource needs to identify a member. SessionUser (src/lib/session.ts)
 * and MediaMember (src/lib/media/types.ts) both satisfy this structurally — callers pass either
 * directly, no conversion needed. */
export interface ActivityMember {
  provider: ProviderId;
  userId: string;
  email: string;
  username: string;
}

export interface ActivitySource {
  readonly id: ProviderId;
  nowPlaying(): Promise<ActiveSession[]>;
  /** ISO timestamp of the member's last seen activity, or null if never seen / unknown. */
  lastSeen(member: ActivityMember): Promise<string | null>;
  personalStats(member: ActivityMember): Promise<PersonalStats | null>;
  personalStatsByType(member: ActivityMember): Promise<PersonalStatsByType>;
  recentHistory(member: ActivityMember, limit: number): Promise<RecentHistoryItem[]>;
  historyPage(member: ActivityMember, offset: number, limit: number): Promise<WatchHistoryPage>;
  globalStats(): Promise<Record<StatCategory, GlobalStat[]>>;
}
```

Remove the duplicate `export const ACTIVITY_TIMEOUT_MS = 12000;` line and its doc comment from `tautulli-source.ts` (the constant now lives in `types.ts` and is imported).

- [ ] **Step 3: Add `createTautulliActivitySource` at the end of `tautulli-source.ts`**

```ts
export function createTautulliActivitySource(
  cfg: { url: string; apiKey: string },
  fetchFn: typeof fetch = fetch
): ActivitySource {
  return {
    id: 'plex',
    nowPlaying: () => getActiveSessions(cfg.url, cfg.apiKey, fetchFn),
    async lastSeen(member) {
      const activity = await getUserActivity(cfg.url, cfg.apiKey, fetchFn);
      const match = activity.find((a) => a.email === member.email.toLowerCase());
      return match?.lastSeenAt ? match.lastSeenAt.toISOString() : null;
    },
    personalStats: (member) => getPersonalStats(cfg.url, cfg.apiKey, member.email, fetchFn),
    async personalStatsByType(member) {
      const userId = await getUserIdByEmail(cfg.url, cfg.apiKey, member.email, fetchFn);
      if (userId === null) return { movies: { count: 0, hours: 0 }, episodes: { count: 0, hours: 0 } };
      return getPersonalStatsByType(cfg.url, cfg.apiKey, userId, fetchFn);
    },
    async recentHistory(member, limit) {
      const userId = await getUserIdByEmail(cfg.url, cfg.apiKey, member.email, fetchFn);
      if (userId === null) return [];
      return getRecentWatchHistory(cfg.url, cfg.apiKey, userId, limit, fetchFn);
    },
    async historyPage(member, offset, limit) {
      const userId = await getUserIdByEmail(cfg.url, cfg.apiKey, member.email, fetchFn);
      if (userId === null) return { items: [], total: 0 };
      return getWatchHistoryPage(cfg.url, cfg.apiKey, userId, offset, limit, fetchFn);
    },
    globalStats: () => getExtendedStats(cfg.url, cfg.apiKey, fetchFn),
  };
}
```

- [ ] **Step 4: Repoint every importer**

```bash
grep -rlE "from '@/lib/tautulli'|from '@/lib/activity'" src | xargs sed -i \
  -e "s#from '@/lib/tautulli'#from '@/lib/activity/tautulli-source'#g" \
  -e "s#from '@/lib/activity'#from '@/lib/activity/tautulli-source'#g"
sed -i "s#from './tautulli'#from './activity/tautulli-source'#g" src/lib/members.ts src/lib/mail-recipients.ts
grep -rn "from '@/lib/tautulli'\|from '@/lib/activity'\|from './tautulli'" src
```

Expected: the final `grep` prints nothing.

- [ ] **Step 5: Move and merge the test files**

```bash
mkdir -p tests/lib/activity
git mv tests/lib/tautulli.test.ts tests/lib/activity/tautulli-source.test.ts
```

Change its import block from:
```ts
import {
  getPersonalStats,
  getUserActivity,
  getExtendedStats,
  getPersonalStatsByType,
  getUserIdByEmail,
  getRecentWatchHistory,
  balanceRecentHistory,
  getWatchHistoryPage,
} from '../../src/lib/tautulli';
import { resetTtlCacheForTests } from '../../src/lib/ttl-cache';
```
to:
```ts
import {
  getPersonalStats,
  getUserActivity,
  getExtendedStats,
  getPersonalStatsByType,
  getUserIdByEmail,
  getRecentWatchHistory,
  balanceRecentHistory,
  getWatchHistoryPage,
} from '../../../src/lib/activity/tautulli-source';
import { resetTtlCacheForTests } from '../../../src/lib/ttl-cache';
```
(one more `../` level, since the file moved one directory deeper).

Append the full content of `tests/lib/activity.test.ts` (all of its `describe('getActiveSessions', ...)` block) to the end of `tests/lib/activity/tautulli-source.test.ts`, and change its own import line
```ts
import { getActiveSessions, ACTIVITY_TIMEOUT_MS } from '../../src/lib/activity';
import { DEFAULT_UPSTREAM_TIMEOUT_MS } from '../../src/lib/fetch-timeout';
```
to (merge with the existing import list at the top of the merged file — add `getActiveSessions, ACTIVITY_TIMEOUT_MS` to the existing named-import list from `../../../src/lib/activity/tautulli-source` and keep one `import { DEFAULT_UPSTREAM_TIMEOUT_MS } from '../../../src/lib/fetch-timeout';` line, deduplicated). Then:

```bash
git rm tests/lib/activity.test.ts
```

Repoint the two importing test files:

```bash
grep -rlE "from '\.\./\.\./src/lib/tautulli'|from '\.\./src/lib/tautulli'|from '@/lib/tautulli'" tests | xargs grep -l "" 
```

Search the whole `tests/` tree for any other reference and fix each one the same way as Step 4's `src` fix (adjusting the relative `../` depth to match each file's location):

```bash
grep -rn "lib/tautulli'\|lib/activity'" tests
```

Fix any hit the same way, then confirm empty.

- [ ] **Step 6: Run typecheck and the whole suite**

```bash
npm run typecheck 2>&1 | tail -20
npx vitest run 2>&1 | tail -15
```

Expected: typecheck clean; whole suite green except the pre-existing `dashboard-stats` failure.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: move activity code into lib/activity/, add the ActivitySource interface" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Registry, aggregation, and wire every call site through them (Tautulli-only, zero behavior change)

**Files:**
- Create: `src/lib/activity/registry.ts`, `src/lib/activity/aggregate.ts`
- Create: `tests/lib/activity/registry.test.ts`, `tests/lib/activity/aggregate.test.ts`, `tests/lib/activity/fake-source.ts`
- Modify: `src/lib/members.ts`, `src/components/AdminMembersList.tsx`, `src/app/admin/members/page.tsx`, `src/app/page.tsx`, `src/app/history/page.tsx`, `src/app/api/dashboard/now-playing/route.ts`, `src/app/api/dashboard/stats/route.ts`, `src/app/api/history/route.ts`
- Test: `tests/lib/members.test.ts`, `tests/api/dashboard-now-playing.test.ts`, `tests/api/dashboard-stats.test.ts`, `tests/api/history.test.ts`, `tests/components/AdminMembersList` (none exist today — none added; component has no test file per the repo's convention, see Task 1's file list)

**Interfaces:**
- Consumes: `ActivitySource`, `ActivityMember`, `ActiveSession`, `GlobalStat`, `StatCategory`, `EMPTY_GLOBAL_STATS` (Task 1); `createTautulliActivitySource` (Task 1).
- Produces (`activity/registry.ts`):
  ```ts
  export interface ActivityConfigSource {
    tautulli: { url: string; apiKey: string } | null;
  }
  export function getActivitySources(config: ActivityConfigSource, fetchFn?: typeof fetch): ActivitySource[]
  export function getActivitySourceFor(sources: ActivitySource[], provider: ProviderId): ActivitySource | null
  ```
- Produces (`activity/aggregate.ts`): `nowPlayingAll(sources: ActivitySource[]): Promise<ActiveSession[]>`, `globalStatsAll(sources: ActivitySource[]): Promise<Record<StatCategory, GlobalStat[]>>`.

- [ ] **Step 1: Write the failing tests**

`tests/lib/activity/fake-source.ts`:

```ts
import type { ActivitySource } from '../../../src/lib/activity/types';
import { EMPTY_GLOBAL_STATS } from '../../../src/lib/activity/types';
import type { ProviderId } from '../../../src/lib/media/types';

export function fakeSource(id: ProviderId, overrides: Partial<ActivitySource> = {}): ActivitySource {
  return {
    id,
    nowPlaying: async () => [],
    lastSeen: async () => null,
    personalStats: async () => null,
    personalStatsByType: async () => ({ movies: { count: 0, hours: 0 }, episodes: { count: 0, hours: 0 } }),
    recentHistory: async () => [],
    historyPage: async () => ({ items: [], total: 0 }),
    globalStats: async () => EMPTY_GLOBAL_STATS,
    ...overrides,
  };
}
```

`tests/lib/activity/registry.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getActivitySources, getActivitySourceFor } from '../../../src/lib/activity/registry';

const TAUTULLI = { url: 'http://tautulli.local', apiKey: 'key' };

describe('getActivitySources', () => {
  it('activates the tautulli source when tautulli is configured', () => {
    expect(getActivitySources({ tautulli: TAUTULLI }).map((s) => s.id)).toEqual(['plex']);
  });

  it('activates nothing when tautulli is missing', () => {
    expect(getActivitySources({ tautulli: null })).toEqual([]);
  });
});

describe('getActivitySourceFor', () => {
  it('returns the source matching the given provider', () => {
    const sources = getActivitySources({ tautulli: TAUTULLI });
    expect(getActivitySourceFor(sources, 'plex')?.id).toBe('plex');
  });

  it('returns null when no source matches', () => {
    const sources = getActivitySources({ tautulli: TAUTULLI });
    expect(getActivitySourceFor(sources, 'jellyfin')).toBeNull();
  });
});
```

`tests/lib/activity/aggregate.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { nowPlayingAll, globalStatsAll } from '../../../src/lib/activity/aggregate';
import { EMPTY_GLOBAL_STATS } from '../../../src/lib/activity/types';
import { fakeSource } from './fake-source';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('nowPlayingAll', () => {
  it('merges sessions from every source', async () => {
    const a = fakeSource('plex', { nowPlaying: async () => [{ title: 'A' } as never] });
    const b = fakeSource('jellyfin', { nowPlaying: async () => [{ title: 'B' } as never] });
    const result = await nowPlayingAll([a, b]);
    expect(result.map((s) => (s as { title: string }).title)).toEqual(['A', 'B']);
  });

  it('returns [] for no sources', async () => {
    expect(await nowPlayingAll([])).toEqual([]);
  });

  it('tolerates one failing source and still returns the other', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const ok = fakeSource('plex', { nowPlaying: async () => [{ title: 'A' } as never] });
    const bad = fakeSource('jellyfin', {
      nowPlaying: async () => {
        throw new Error('down');
      },
    });
    expect((await nowPlayingAll([ok, bad])).map((s) => (s as { title: string }).title)).toEqual(['A']);
  });
});

describe('globalStatsAll', () => {
  it('merges and re-ranks a category by value, descending, capped at 10', async () => {
    const a = fakeSource('plex', {
      globalStats: async () => ({
        ...EMPTY_GLOBAL_STATS,
        topMovies: [{ title: 'Low', value: 2 }, { title: 'High', value: 50 }],
      }),
    });
    const b = fakeSource('jellyfin', {
      globalStats: async () => ({ ...EMPTY_GLOBAL_STATS, topMovies: [{ title: 'Mid', value: 10 }] }),
    });
    const result = await globalStatsAll([a, b]);
    expect(result.topMovies.map((s) => s.title)).toEqual(['High', 'Mid', 'Low']);
  });

  it('returns EMPTY_GLOBAL_STATS for no sources', async () => {
    expect(await globalStatsAll([])).toEqual(EMPTY_GLOBAL_STATS);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/lib/activity/registry.test.ts tests/lib/activity/aggregate.test.ts`
Expected: FAIL (modules do not exist).

- [ ] **Step 3: Implement `activity/registry.ts` and `activity/aggregate.ts`**

`src/lib/activity/registry.ts`:

```ts
import { createTautulliActivitySource } from './tautulli-source';
import type { ActivitySource } from './types';
import type { ProviderId } from '../media/types';

// Only the slices of AppConfig this registry needs, so it stays decoupled from config.ts
// (matching src/lib/media/registry.ts's ProviderConfigSource pattern).
export interface ActivityConfigSource {
  tautulli: { url: string; apiKey: string } | null;
}

export function getActivitySources(config: ActivityConfigSource, fetchFn: typeof fetch = fetch): ActivitySource[] {
  const sources: ActivitySource[] = [];
  if (config.tautulli) {
    sources.push(createTautulliActivitySource(config.tautulli, fetchFn));
  }
  return sources;
}

export function getActivitySourceFor(sources: ActivitySource[], provider: ProviderId): ActivitySource | null {
  return sources.find((s) => s.id === provider) ?? null;
}
```

`src/lib/activity/aggregate.ts`:

```ts
import type { ActiveSession, ActivitySource, GlobalStat, StatCategory } from './types';
import { EMPTY_GLOBAL_STATS } from './types';

// Runs `fn` on every source. A failing source is logged and skipped so one dead
// server never blanks the whole page; matches src/lib/media/aggregate.ts's `collect`.
async function collect<T>(sources: ActivitySource[], fn: (s: ActivitySource) => Promise<T>): Promise<T[]> {
  const results = await Promise.allSettled(sources.map(fn));
  const ok: T[] = [];
  let failure: { reason: unknown } | null = null;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') {
      ok.push(r.value);
    } else {
      console.error(`Activity source "${sources[i].id}" failed:`, r.reason);
      failure ??= { reason: r.reason };
    }
  }
  if (ok.length === 0 && failure) throw failure.reason;
  return ok;
}

export async function nowPlayingAll(sources: ActivitySource[]): Promise<ActiveSession[]> {
  return (await collect(sources, (s) => s.nowPlaying())).flat();
}

const CATEGORIES: StatCategory[] = [
  'topMovies',
  'popularMovies',
  'topTv',
  'popularTv',
  'topLibraries',
  'topUsers',
  'topPlatforms',
  'mostConcurrent',
];
const MERGED_CAP = 10;

export async function globalStatsAll(sources: ActivitySource[]): Promise<Record<StatCategory, GlobalStat[]>> {
  const perSource = await collect(sources, (s) => s.globalStats());
  const merged = { ...EMPTY_GLOBAL_STATS };
  for (const category of CATEGORIES) {
    merged[category] = perSource
      .flatMap((r) => r[category])
      .sort((a, b) => b.value - a.value)
      .slice(0, MERGED_CAP);
  }
  return merged;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run tests/lib/activity/registry.test.ts tests/lib/activity/aggregate.test.ts`
Expected: PASS.

- [ ] **Step 5: Rewrite `members.ts`'s `getMemberOverview` to use the registry**

Replace the whole of `src/lib/members.ts` with:

```ts
import type Database from 'better-sqlite3';
import type { ActivitySource } from './activity/types';
import { getActivitySourceFor } from './activity/registry';
import { isSubscribed } from './newsletter-subscriptions';
import type { ProviderId } from './media/types';

export interface MemberOverview {
  provider: ProviderId;
  userId: string;
  username: string;
  email: string;
  portalLastLogin: string;
  lastSeen: string | null;
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

// Plain DB read, no activity-source round-trip — for callers that only need the
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

export async function getMemberOverview(db: Database.Database, sources: ActivitySource[]): Promise<MemberOverview[]> {
  const users = listUsers(db);

  return Promise.all(
    users.map(async (u) => {
      const source = getActivitySourceFor(sources, u.provider);
      let lastSeen: string | null = null;
      if (source) {
        try {
          lastSeen = await source.lastSeen(u);
        } catch (err) {
          console.error(`Failed to fetch ${u.provider} activity for member overview:`, err);
        }
      }
      return {
        provider: u.provider,
        userId: u.userId,
        username: u.username,
        email: u.email,
        portalLastLogin: u.lastLogin,
        lastSeen,
        newsletterOptedIn: isSubscribed(db, { provider: u.provider, userId: u.userId }),
      };
    })
  );
}
```

(`MemberOverview.tautulliLastSeen` is renamed `lastSeen` — provider-generic, matching the spec's column rename. The per-member try/catch replaces the old single try/catch around one bulk Tautulli call — behaviorally equivalent, since `getUserActivity` was already `withTtlCache`'d: N `lastSeen` calls against the Tautulli source still make exactly one real HTTP request.)

- [ ] **Step 6: Update `AdminMembersList.tsx`'s column and prop**

In `src/components/AdminMembersList.tsx`, change the header `<th className="py-2 pr-4">Dernière activité Plex</th>` to `<th className="py-2 pr-4">Dernière activité</th>`, and change `{formatDate(m.tautulliLastSeen)}` to `{formatDate(m.lastSeen)}`.

- [ ] **Step 7: Wire `admin/members/page.tsx`**

In `src/app/admin/members/page.tsx`, add `import { getActivitySources } from '@/lib/activity/registry';` and replace `const members = await getMemberOverview(db, config.tautulli.url, config.tautulli.apiKey);` with:

```ts
  const members = await getMemberOverview(db, getActivitySources(config));
```

- [ ] **Step 8: Wire the dashboard now-playing route**

Replace `src/app/api/dashboard/now-playing/route.ts`'s body:

```ts
import { NextResponse } from 'next/server';
import { nowPlayingAll } from '@/lib/activity/aggregate';
import { getActivitySources } from '@/lib/activity/registry';
import { loadConfig, isSetupComplete, assertConfigured } from '@/lib/config';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const rawConfig = loadConfig(process.env, getDb());
  if (!isSetupComplete(rawConfig)) {
    return NextResponse.json({ error: 'setup_incomplete' }, { status: 503 });
  }
  const config = assertConfigured(rawConfig);
  try {
    const sessions = await nowPlayingAll(getActivitySources(config));
    return NextResponse.json(sessions);
  } catch (err) {
    console.error('Failed to fetch active sessions:', err);
    return NextResponse.json({ error: 'Failed to fetch active sessions' }, { status: 502 });
  }
}
```

- [ ] **Step 9: Wire the dashboard stats route**

Replace `src/app/api/dashboard/stats/route.ts` with:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { globalStatsAll } from '@/lib/activity/aggregate';
import { getActivitySources, getActivitySourceFor } from '@/lib/activity/registry';
import type { PersonalStatsByType } from '@/lib/activity/types';
import { verifySession, SESSION_COOKIE_NAME } from '@/lib/session';
import { loadConfig, isSetupComplete, assertConfigured } from '@/lib/config';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const rawConfig = loadConfig(process.env, getDb());
  if (!isSetupComplete(rawConfig)) {
    return NextResponse.json({ error: 'setup_incomplete' }, { status: 503 });
  }
  const config = assertConfigured(rawConfig);
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const sessionUser = token ? await verifySession(token, config.session.secret) : null;

  try {
    const sources = getActivitySources(config);
    const extended = await globalStatsAll(sources);

    let personal = null;
    let personalByType: PersonalStatsByType | null = null;
    let recentHistory: Awaited<ReturnType<(typeof sources)[number]['recentHistory']>> = [];
    if (sessionUser) {
      const source = getActivitySourceFor(sources, sessionUser.provider);
      if (source) {
        [personal, personalByType, recentHistory] = await Promise.all([
          source.personalStats(sessionUser),
          source.personalStatsByType(sessionUser),
          source.recentHistory(sessionUser, 8),
        ]);
      }
    }

    return NextResponse.json({ personal, extended, personalByType, recentHistory });
  } catch (err) {
    console.error('Failed to fetch stats:', err);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 502 });
  }
}
```

- [ ] **Step 10: Wire the history route and page**

Replace `src/app/api/history/route.ts`'s body from `const userId = await getUserIdByEmail(...)` through the end of the `try` block with:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { verifySession, SESSION_COOKIE_NAME } from '@/lib/session';
import { loadConfig, isSetupComplete, assertConfigured } from '@/lib/config';
import { getDb } from '@/lib/db';
import { getActivitySources, getActivitySourceFor } from '@/lib/activity/registry';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 30;

export async function GET(request: NextRequest) {
  try {
    const rawConfig = loadConfig(process.env, getDb());
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const sessionUser = token ? await verifySession(token, rawConfig.session.secret) : null;
    if (!sessionUser) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    if (!isSetupComplete(rawConfig)) {
      return NextResponse.json({ error: 'setup_incomplete' }, { status: 503 });
    }
    const config = assertConfigured(rawConfig);

    const rawOffset = Number(request.nextUrl.searchParams.get('offset') ?? '0');
    const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? Math.floor(rawOffset) : 0;

    const source = getActivitySourceFor(getActivitySources(config), sessionUser.provider);
    if (!source) {
      return NextResponse.json({ items: [], total: 0 });
    }

    const page = await source.historyPage(sessionUser, offset, PAGE_SIZE);
    return NextResponse.json(page);
  } catch (err) {
    console.error('Failed to fetch watch history page:', err);
    return NextResponse.json({ error: 'Failed to fetch watch history page' }, { status: 502 });
  }
}
```

In `src/app/history/page.tsx`, replace the import `import { getUserIdByEmail, getWatchHistoryPage } from '@/lib/tautulli';` (already repointed to `@/lib/activity/tautulli-source` by Task 1) with `import { getActivitySources, getActivitySourceFor } from '@/lib/activity/registry';`, and replace the whole `try { ... } catch (err) { ... }` block with:

```ts
  let items: { title: string; type: 'movie' | 'episode'; thumbPath: string; watchedAt: string }[] = [];
  let total = 0;
  try {
    const source = getActivitySourceFor(getActivitySources(config), sessionUser.provider);
    if (source) {
      const page = await source.historyPage(sessionUser, 0, PAGE_SIZE);
      items = page.items;
      total = page.total;
    }
  } catch (err) {
    console.error('Failed to load watch history page:', err);
  }
```

- [ ] **Step 11: Wire `app/page.tsx`**

In `src/app/page.tsx`:
- Replace `import { getActiveSessions, type ActiveSession } from '@/lib/activity';` with `import { nowPlayingAll, globalStatsAll } from '@/lib/activity/aggregate';` and `import { getActivitySources, getActivitySourceFor } from '@/lib/activity/registry';`.
- Replace the `import { getPersonalStats, ... } from '@/lib/tautulli';` block with `import type { ActiveSession, GlobalStat, PersonalStats, PersonalStatsByType, RecentHistoryItem, StatCategory } from '@/lib/activity/types'; import { EMPTY_GLOBAL_STATS } from '@/lib/activity/types';`.
- Replace `const EMPTY_EXTENDED_STATS: Record<StatCategory, GlobalStat[]> = { ... };` with removing that block entirely and using `EMPTY_GLOBAL_STATS` in its place at the one call site below.
- Replace the whole `loadStats` function body with:

```ts
async function loadStats(sessionUser: SessionUser | null, config: ConfiguredAppConfig) {
  const sources = getActivitySources(config);
  const extended = await globalStatsAll(sources);

  let personal: PersonalStats | null = null;
  let personalByType: PersonalStatsByType | null = null;
  let recentHistory: RecentHistoryItem[] = [];
  if (sessionUser) {
    const source = getActivitySourceFor(sources, sessionUser.provider);
    if (source) {
      [personal, personalByType, recentHistory] = await Promise.all([
        source.personalStats(sessionUser),
        source.personalStatsByType(sessionUser),
        source.recentHistory(sessionUser, 8),
      ]);
    }
  }

  return { personal, extended, personalByType, recentHistory };
}
```

- Replace the `safe<ActiveSession[]>('now-playing', [], () => getActiveSessions(config.tautulli.url, config.tautulli.apiKey))` line with `safe<ActiveSession[]>('now-playing', [], () => nowPlayingAll(getActivitySources(config)))`.
- In the `stats` branch's fallback object, replace `extended: EMPTY_EXTENDED_STATS,` with `extended: EMPTY_GLOBAL_STATS,`.

- [ ] **Step 12: Update the tests for the new call shapes**

`tests/lib/members.test.ts`: replace every `getMemberOverview(db, 'https://tautulli.example.com', 'apikey')` call with `getMemberOverview(db, getActivitySources({ tautulli: { url: 'https://tautulli.example.com', apiKey: 'apikey' } }))`, adding `import { getActivitySources } from '../../src/lib/activity/registry';` to the file's imports. Rename every `tautulliLastSeen:` key in the expected objects to `lastSeen:`.

`tests/api/dashboard-now-playing.test.ts`, `tests/api/dashboard-stats.test.ts`, `tests/api/history.test.ts`: these already mock `global.fetch` and drive the routes through `REQUIRED_ENV` (Tautulli configured, Jellyfin not configured) — no assertion changes needed, since `getActivitySources({tautulli: {...}})` produces the exact same single Tautulli source `getActiveSessions`/etc. already called. Run them to confirm; if any import path inside these test files still says `../../src/lib/tautulli` (missed by Task 1's `src`-only sed), fix it to `../../src/lib/activity/tautulli-source`.

- [ ] **Step 13: Full verification**

```bash
npm run typecheck 2>&1 | tail -20
npx vitest run 2>&1 | tail -20
SESSION_SECRET=verify-secret-0123456789abcdef0123456789 npm run build 2>&1 | tail -20
```

Expected: typecheck clean; whole suite green except the pre-existing `dashboard-stats` failure; `next build` succeeds. A Plex+Tautulli-only install's dashboard/stats/history/admin-members responses are unchanged in shape except the `MemberOverview.tautulliLastSeen` → `lastSeen` rename (an internal server-side field, not user-facing JSON — `admin/members/page.tsx` passes it straight into the React component, never through a JSON API route, so no external contract changes).

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "feat: add the activity registry and aggregator, wire every call site through them" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Native Jellyfin now-playing

**Files:**
- Modify: `src/lib/media/jellyfin.ts`
- Create: `src/lib/activity/jellyfin-native-source.ts`
- Test: `tests/lib/media/jellyfin.test.ts` (additions), `tests/lib/activity/jellyfin-native-source.test.ts`

**Interfaces:**
- Consumes: `jfGet`, `JellyfinProviderConfig`, `jellyfinPosterRef` (all already in `media/jellyfin.ts`).
- Produces (`media/jellyfin.ts`):
  ```ts
  export interface JellyfinSession {
    userName: string;
    deviceName: string;
    item: {
      id: string; name: string; type: string; seriesName: string | null; seasonId: string | null;
      seasonNumber: number | null; episodeNumber: number | null; runTimeTicks: number | null;
    };
    isPaused: boolean;
    positionTicks: number;
    playMethod: string | null; // 'DirectPlay' | 'DirectStream' | 'Transcode', as Jellyfin sends it
    transcodingBitrate: number | null; // bits/sec
  }
  export function normalizeJellyfinSessions(raw: unknown[]): JellyfinSession[]
  export async function getSessions(cfg: JellyfinProviderConfig, fetchFn?: typeof fetch): Promise<JellyfinSession[]>
  ```
- Produces (`activity/jellyfin-native-source.ts`): `createJellyfinNativeActivitySource(cfg: JellyfinProviderConfig, fetchFn?: typeof fetch): ActivitySource`, and `mapJellyfinSessionToActiveSession(session: JellyfinSession): ActiveSession` (exported so Task 5's Jellystat source can reuse the same mapping for its own now-playing, which returns the identical raw Jellyfin session shape).

- [ ] **Step 1: Write the failing tests**

Append to `tests/lib/media/jellyfin.test.ts` (add `getSessions`, `normalizeJellyfinSessions` to the existing import list from `'../../../src/lib/media/jellyfin'`):

```ts
describe('getSessions', () => {
  it('drops idle sessions (no NowPlayingItem) and keeps ones that are playing', async () => {
    const fetchFn = vi.fn(async () =>
      res([
        { UserName: null, DeviceName: 'Jellyfin Server' },
        {
          UserName: 'alice',
          DeviceName: 'Living Room TV',
          NowPlayingItem: {
            Id: 'a'.repeat(32),
            Name: 'Some Movie',
            Type: 'Movie',
            ProductionYear: 2024,
            RunTimeTicks: 72000000000,
          },
          PlayState: { IsPaused: false, PositionTicks: 6000000000, PlayMethod: 'DirectPlay' },
        },
      ])
    ) as unknown as typeof fetch;
    const sessions = await getSessions(CFG, fetchFn);
    expect(sessions).toEqual([
      {
        userName: 'alice',
        deviceName: 'Living Room TV',
        item: {
          id: 'a'.repeat(32),
          name: 'Some Movie',
          type: 'Movie',
          seriesName: null,
          seasonId: null,
          seasonNumber: null,
          episodeNumber: null,
          runTimeTicks: 72000000000,
        },
        isPaused: false,
        positionTicks: 6000000000,
        playMethod: 'DirectPlay',
        transcodingBitrate: null,
      },
    ]);
    const url = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toBe(`${CFG.url}/Sessions`);
  });

  it('maps an episode session, including transcoding bitrate', async () => {
    const fetchFn = vi.fn(async () =>
      res([
        {
          UserName: 'bob',
          DeviceName: 'Chrome',
          NowPlayingItem: {
            Id: 'b'.repeat(32),
            Name: 'Episode Title',
            Type: 'Episode',
            SeriesName: 'Some Show',
            SeasonId: 'c'.repeat(32),
            ParentIndexNumber: 2,
            IndexNumber: 5,
            RunTimeTicks: 18000000000,
          },
          PlayState: { IsPaused: true, PositionTicks: 1000000000, PlayMethod: 'Transcode' },
          TranscodingInfo: { Bitrate: 4000000 },
        },
      ])
    ) as unknown as typeof fetch;
    const sessions = await getSessions(CFG, fetchFn);
    expect(sessions[0]).toMatchObject({
      userName: 'bob',
      item: { seriesName: 'Some Show', seasonId: 'c'.repeat(32), seasonNumber: 2, episodeNumber: 5 },
      isPaused: true,
      playMethod: 'Transcode',
      transcodingBitrate: 4000000,
    });
  });

  it('returns [] when nobody is playing', async () => {
    const fetchFn = vi.fn(async () => res([])) as unknown as typeof fetch;
    expect(await getSessions(CFG, fetchFn)).toEqual([]);
  });
});
```

(This file already defines a `res(body)` helper and a `CFG` constant from earlier tests in sub-project 2 — reuse them; do not redefine.)

Create `tests/lib/activity/jellyfin-native-source.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createJellyfinNativeActivitySource } from '../../../src/lib/activity/jellyfin-native-source';
import { EMPTY_GLOBAL_STATS } from '../../../src/lib/activity/types';

const CFG = { url: 'http://jellyfin.local:8096', apiKey: 'key' };
const MEMBER = { provider: 'jellyfin' as const, userId: 'a'.repeat(32), email: '', username: 'alice' };

function res(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

describe('createJellyfinNativeActivitySource', () => {
  it('identifies itself as the jellyfin source', () => {
    expect(createJellyfinNativeActivitySource(CFG, vi.fn()).id).toBe('jellyfin');
  });

  it('maps a real playing session to ActiveSession (movie)', async () => {
    const fetchFn = vi.fn(async () =>
      res([
        {
          UserName: 'alice',
          DeviceName: 'Living Room TV',
          NowPlayingItem: { Id: 'a'.repeat(32), Name: 'Some Movie', Type: 'Movie', ProductionYear: 2024, RunTimeTicks: 72000000000 },
          PlayState: { IsPaused: false, PositionTicks: 6000000000, PlayMethod: 'DirectPlay' },
        },
      ])
    ) as unknown as typeof fetch;
    const source = createJellyfinNativeActivitySource(CFG, fetchFn);
    expect(await source.nowPlaying()).toEqual([
      {
        title: 'Some Movie',
        showTitle: null,
        seasonNumber: null,
        episodeNumber: null,
        year: '2024',
        mediaType: 'movie',
        user: 'alice',
        player: 'Living Room TV',
        bandwidthKbps: 0,
        transcodeDecision: 'direct play',
        viewOffsetMs: 600000,
        durationMs: 7200000,
        state: 'playing',
        posterPath: `jellyfin:${'a'.repeat(32)}`,
      },
    ]);
  });

  it('maps an episode session, using the season id for the poster and title/showTitle split', async () => {
    const fetchFn = vi.fn(async () =>
      res([
        {
          UserName: 'bob',
          DeviceName: 'Chrome',
          NowPlayingItem: { Id: 'b'.repeat(32), Name: 'Episode Title', Type: 'Episode', SeriesName: 'Some Show', SeasonId: 'c'.repeat(32), ParentIndexNumber: 2, IndexNumber: 5, RunTimeTicks: 18000000000 },
          PlayState: { IsPaused: true, PositionTicks: 1000000000, PlayMethod: 'Transcode' },
          TranscodingInfo: { Bitrate: 4000000 },
        },
      ])
    ) as unknown as typeof fetch;
    const source = createJellyfinNativeActivitySource(CFG, fetchFn);
    const [session] = await source.nowPlaying();
    expect(session).toMatchObject({
      title: 'Some Show',
      showTitle: 'Episode Title',
      seasonNumber: 2,
      episodeNumber: 5,
      mediaType: 'episode',
      user: 'bob',
      state: 'paused',
      transcodeDecision: 'transcode',
      bandwidthKbps: 4000,
      posterPath: `jellyfin:${'c'.repeat(32)}`,
    });
  });

  it('every other method returns empty/null — deliberate degradation of the native source', async () => {
    const source = createJellyfinNativeActivitySource(CFG, vi.fn());
    expect(await source.lastSeen(MEMBER)).toBeNull();
    expect(await source.personalStats(MEMBER)).toBeNull();
    expect(await source.personalStatsByType(MEMBER)).toEqual({ movies: { count: 0, hours: 0 }, episodes: { count: 0, hours: 0 } });
    expect(await source.recentHistory(MEMBER, 8)).toEqual([]);
    expect(await source.historyPage(MEMBER, 0, 30)).toEqual({ items: [], total: 0 });
    expect(await source.globalStats()).toEqual(EMPTY_GLOBAL_STATS);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/lib/media/jellyfin.test.ts tests/lib/activity/jellyfin-native-source.test.ts`
Expected: FAIL (`getSessions`/`normalizeJellyfinSessions` and the new module do not exist).

- [ ] **Step 3: Add `getSessions` to `media/jellyfin.ts`**

Append to `src/lib/media/jellyfin.ts`:

```ts
export interface JellyfinSession {
  userName: string;
  deviceName: string;
  item: {
    id: string;
    name: string;
    type: string;
    seriesName: string | null;
    seasonId: string | null;
    seasonNumber: number | null;
    episodeNumber: number | null;
    runTimeTicks: number | null;
  };
  isPaused: boolean;
  positionTicks: number;
  playMethod: string | null;
  transcodingBitrate: number | null;
}

interface RawSessionItem {
  Id: string;
  Name?: string;
  Type?: string;
  SeriesName?: string;
  SeasonId?: string;
  ParentIndexNumber?: number;
  IndexNumber?: number;
  RunTimeTicks?: number;
}

interface RawSession {
  UserName?: string | null;
  DeviceName?: string;
  NowPlayingItem?: RawSessionItem;
  PlayState?: { IsPaused?: boolean; PositionTicks?: number; PlayMethod?: string };
  TranscodingInfo?: { Bitrate?: number } | null;
}

// Jellyfin's /Sessions lists every open connection, including ones nobody is
// watching on (e.g. the server's own loopback session) — only entries with a
// NowPlayingItem represent real playback. Exported (not folded into
// getSessions) so Jellystat's proxy of this same raw JSON (verified 2026-09-22
// to be a pass-through, not Jellystat's own shape) can reuse it without a
// second HTTP round-trip through this module.
export function normalizeJellyfinSessions(raw: unknown[]): JellyfinSession[] {
  return (raw as RawSession[])
    .filter((s): s is RawSession & { NowPlayingItem: RawSessionItem } => s.NowPlayingItem != null)
    .map((s) => ({
      userName: s.UserName ?? '',
      deviceName: s.DeviceName ?? '',
      item: {
        id: s.NowPlayingItem.Id,
        name: s.NowPlayingItem.Name ?? '',
        type: s.NowPlayingItem.Type ?? '',
        seriesName: s.NowPlayingItem.SeriesName ?? null,
        seasonId: s.NowPlayingItem.SeasonId ?? null,
        seasonNumber: s.NowPlayingItem.ParentIndexNumber ?? null,
        episodeNumber: s.NowPlayingItem.IndexNumber ?? null,
        runTimeTicks: s.NowPlayingItem.RunTimeTicks ?? null,
      },
      isPaused: s.PlayState?.IsPaused === true,
      positionTicks: s.PlayState?.PositionTicks ?? 0,
      playMethod: s.PlayState?.PlayMethod ?? null,
      transcodingBitrate: s.TranscodingInfo?.Bitrate ?? null,
    }));
}

// Not exercised against a real playing session (verified 2026-09-22 with nothing
// playing) — the field mapping follows Jellyfin's documented SessionInfo shape,
// not confirmed live. Treat a mapping bug here as plausible until proven otherwise.
export async function getSessions(cfg: JellyfinProviderConfig, fetchFn: typeof fetch = fetch): Promise<JellyfinSession[]> {
  const raw = await jfGet<unknown[]>(cfg, '/Sessions', fetchFn);
  return normalizeJellyfinSessions(raw);
}
```

- [ ] **Step 4: Implement `activity/jellyfin-native-source.ts`**

```ts
import { getSessions, jellyfinPosterRef, type JellyfinProviderConfig, type JellyfinSession } from '../media/jellyfin';
import type { ActiveSession, ActivitySource } from './types';
import { EMPTY_GLOBAL_STATS } from './types';

// Ticks are 100-nanosecond units (Jellyfin/`.NET` convention); /10000 gives ms.
const TICKS_PER_MS = 10000;

export function mapJellyfinSessionToActiveSession(session: JellyfinSession): ActiveSession {
  const isEpisode = session.item.type === 'Episode' && session.item.seriesName !== null;
  const transcodeDecision: ActiveSession['transcodeDecision'] =
    session.playMethod === 'Transcode' ? 'transcode' : session.playMethod === 'DirectStream' ? 'copy' : 'direct play';
  return {
    title: isEpisode ? (session.item.seriesName as string) : session.item.name,
    showTitle: isEpisode ? session.item.name : null,
    seasonNumber: isEpisode ? session.item.seasonNumber : null,
    episodeNumber: isEpisode ? session.item.episodeNumber : null,
    // Jellyfin gives ProductionYear as a number on the item; this endpoint's raw
    // shape doesn't carry it (see the mapping's documented unverified status),
    // so this stays '' until confirmed against a real session.
    year: '',
    mediaType: session.item.type === 'Movie' ? 'movie' : session.item.type === 'Episode' ? 'episode' : session.item.type === 'Audio' ? 'track' : 'other',
    user: session.userName,
    player: session.deviceName,
    bandwidthKbps: session.transcodingBitrate ? Math.round(session.transcodingBitrate / 1000) : 0,
    transcodeDecision,
    viewOffsetMs: Math.round(session.positionTicks / TICKS_PER_MS),
    durationMs: session.item.runTimeTicks ? Math.round(session.item.runTimeTicks / TICKS_PER_MS) : 0,
    state: session.isPaused ? 'paused' : 'playing',
    posterPath: jellyfinPosterRef(isEpisode && session.item.seasonId ? session.item.seasonId : session.item.id),
  };
}

export function createJellyfinNativeActivitySource(
  cfg: JellyfinProviderConfig,
  fetchFn: typeof fetch = fetch
): ActivitySource {
  return {
    id: 'jellyfin',
    async nowPlaying() {
      const sessions = await getSessions(cfg, fetchFn);
      return sessions.map(mapJellyfinSessionToActiveSession);
    },
    lastSeen: async () => null,
    personalStats: async () => null,
    personalStatsByType: async () => ({ movies: { count: 0, hours: 0 }, episodes: { count: 0, hours: 0 } }),
    recentHistory: async () => [],
    historyPage: async () => ({ items: [], total: 0 }),
    globalStats: async () => EMPTY_GLOBAL_STATS,
  };
}
```

Test note: the "movie" test in Step 1 expects `year: '2024'` from `ProductionYear: 2024` in the fixture, but the implementation above hardcodes `year: ''` because the verified `/Sessions` mapping fields in the Global Constraints list do not include a confirmed `ProductionYear` passthrough on `NowPlayingItem` in this endpoint's context. **Resolve this before writing the test:** since the OpenAPI schema for `SessionInfo.NowPlayingItem` (a `BaseItemDto`) does list `ProductionYear`, include it in `RawSessionItem` (`ProductionYear?: number`) and `JellyfinSession.item` (`productionYear: number | null`), map it in `normalizeJellyfinSessions` (`productionYear: s.NowPlayingItem.ProductionYear ?? null`), and in `mapJellyfinSessionToActiveSession` use `year: session.item.productionYear !== null ? String(session.item.productionYear) : ''`. Update both new test files' expectations to include `productionYear: 2024` (movie test) / `productionYear: null` (episode test, since the fixture in Step 1 doesn't set it) in the `JellyfinSession` shape, and keep `year: '2024'` / no `year` assertion change needed in the `ActiveSession` test (`toMatchObject` doesn't require `year` in the episode case, but add `year: ''` there for completeness since the fixture has no `ProductionYear`).

- [ ] **Step 5: Run to verify they pass, then the whole suite**

```bash
npx vitest run tests/lib/media/jellyfin.test.ts tests/lib/activity/jellyfin-native-source.test.ts 2>&1 | tail -20
npm run typecheck 2>&1 | tail -10
npx vitest run 2>&1 | tail -10
```

Expected: the new tests PASS; typecheck clean; whole suite green except the pre-existing failure.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add native Jellyfin now-playing (media/jellyfin.ts getSessions, activity/jellyfin-native-source.ts)" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Low-level Jellystat client

**Files:**
- Create: `src/lib/activity/jellystat.ts`
- Test: `tests/lib/activity/jellystat.test.ts`

**Interfaces:**
- Consumes: `timeoutSignal` from `../fetch-timeout`; `withTtlCache`, `DEFAULT_CACHE_TTL_MS` from `../ttl-cache`; `GlobalStat`, `RecentHistoryItem`, `WatchHistoryPage` from `./types`; `jellyfinPosterRef` from `../media/jellyfin`.
- Produces:
  ```ts
  export interface JellystatConfig { url: string; apiKey: string }
  export interface JellystatMemberActivity { userId: string; lastSeenAt: string | null }
  listMemberActivity(cfg: JellystatConfig, fetchFn?: typeof fetch): Promise<JellystatMemberActivity[]>
  getUserHistoryPage(cfg: JellystatConfig, userId: string, page: number, size: number, fetchFn?: typeof fetch): Promise<WatchHistoryPage>
  getMostViewedByType(cfg: JellystatConfig, type: 'Movie' | 'Series', fetchFn?: typeof fetch): Promise<GlobalStat[]>
  getMostPopularByType(cfg: JellystatConfig, type: 'Movie' | 'Series', fetchFn?: typeof fetch): Promise<GlobalStat[]>
  getMostViewedLibraries(cfg: JellystatConfig, fetchFn?: typeof fetch): Promise<GlobalStat[]>
  getMostActiveUsers(cfg: JellystatConfig, fetchFn?: typeof fetch): Promise<GlobalStat[]>
  getJellystatSessionsRaw(cfg: JellystatConfig, fetchFn?: typeof fetch): Promise<unknown[]>
  ```

- [ ] **Step 1: Write the failing tests**

`tests/lib/activity/jellystat.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  listMemberActivity,
  getUserHistoryPage,
  getMostViewedByType,
  getMostPopularByType,
  getMostViewedLibraries,
  getMostActiveUsers,
  getJellystatSessionsRaw,
} from '../../../src/lib/activity/jellystat';
import { resetTtlCacheForTests } from '../../../src/lib/ttl-cache';

const CFG = { url: 'http://jellystat.local:3000', apiKey: 'js-key' };
const UID = 'a'.repeat(32);

beforeEach(() => {
  resetTtlCacheForTests();
});

function res(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, statusText: status === 200 ? 'OK' : 'Error', json: async () => body } as unknown as Response;
}

function calls(fetchFn: typeof fetch) {
  return (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls as Array<[string, RequestInit]>;
}

describe('listMemberActivity', () => {
  it('sends the api key header and maps rows, caching the result', async () => {
    const fetchFn = vi.fn(async () =>
      res([{ UserId: UID, UserName: 'alice', LastActivityDate: '2026-05-18T13:53:12.541Z', TotalPlays: 7, TotalWatchTime: 10046 }])
    ) as unknown as typeof fetch;
    const activity = await listMemberActivity(CFG, fetchFn);
    expect(activity).toEqual([{ userId: UID, lastSeenAt: '2026-05-18T13:53:12.541Z' }]);
    const [url, init] = calls(fetchFn)[0];
    expect(url).toBe('http://jellystat.local:3000/stats/getAllUserActivity');
    expect((init.headers as Record<string, string>)['x-api-token']).toBe('js-key');

    await listMemberActivity(CFG, fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('handles a member with no activity date', async () => {
    const fetchFn = vi.fn(async () => res([{ UserId: UID, UserName: 'alice', LastActivityDate: null }])) as unknown as typeof fetch;
    expect(await listMemberActivity(CFG, fetchFn)).toEqual([{ userId: UID, lastSeenAt: null }]);
  });

  it('throws with the status when Jellystat answers non-ok', async () => {
    const fetchFn = vi.fn(async () => res({}, 401)) as unknown as typeof fetch;
    await expect(listMemberActivity(CFG, fetchFn)).rejects.toThrow('Jellystat API request failed: 401');
  });
});

describe('getUserHistoryPage', () => {
  it('posts userid and paging params and maps results, sorted newest first', async () => {
    const fetchFn = vi.fn(async () =>
      res({
        current_page: 1,
        pages: 3,
        size: 2,
        results: [
          {
            NowPlayingItemName: 'Out East',
            SeriesName: 'Your Friends & Neighbors',
            SeasonId: 'e'.repeat(32),
            EpisodeId: 'f'.repeat(32),
            EpisodeNumber: 7,
            SeasonNumber: 2,
            FullName: 'Your Friends & Neighbors : S2E7 - Out East',
            ActivityDateInserted: '2026-05-18T13:53:12.541Z',
            PlaybackDuration: 3329,
          },
          {
            NowPlayingItemName: 'The Way',
            SeriesName: null,
            NowPlayingItemId: 'g'.repeat(32),
            FullName: 'The Way',
            ActivityDateInserted: '2026-05-17T09:00:00.000Z',
            PlaybackDuration: 6000,
          },
        ],
      })
    ) as unknown as typeof fetch;
    const page = await getUserHistoryPage(CFG, UID, 1, 2, fetchFn);
    expect(page).toEqual({
      items: [
        { title: 'Your Friends & Neighbors : S2E7 - Out East', type: 'episode', thumbPath: `jellyfin:${'e'.repeat(32)}`, watchedAt: '2026-05-18T13:53:12.541Z' },
        { title: 'The Way', type: 'movie', thumbPath: `jellyfin:${'g'.repeat(32)}`, watchedAt: '2026-05-17T09:00:00.000Z' },
      ],
      total: 6, // pages(3) * size(2) — see comment below
    });
    const [url, init] = calls(fetchFn)[0];
    expect(url).toBe('http://jellystat.local:3000/api/getUserHistory?size=2&page=1&sort=ActivityDateInserted&desc=true');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ userid: UID });
  });
});

describe('the four box-office queries', () => {
  it('getMostViewedByType maps Name/Plays/Id and sends days=365 with the requested type', async () => {
    const fetchFn = vi.fn(async () => res([{ Name: 'The Way', Plays: 5, Id: 'h'.repeat(32) }])) as unknown as typeof fetch;
    expect(await getMostViewedByType(CFG, 'Movie', fetchFn)).toEqual([{ title: 'The Way', value: 5, posterPath: `jellyfin:${'h'.repeat(32)}` }]);
    const [url, init] = calls(fetchFn)[0];
    expect(url).toBe('http://jellystat.local:3000/stats/getMostViewedByType');
    expect(JSON.parse(init.body as string)).toEqual({ days: 365, type: 'Movie' });
  });

  it('getMostPopularByType maps Name/unique_viewers/Id', async () => {
    const fetchFn = vi.fn(async () => res([{ Name: 'The Way', unique_viewers: 3, Id: 'h'.repeat(32) }])) as unknown as typeof fetch;
    expect(await getMostPopularByType(CFG, 'Movie', fetchFn)).toEqual([{ title: 'The Way', value: 3, posterPath: `jellyfin:${'h'.repeat(32)}` }]);
  });

  it('getMostViewedLibraries maps Name/Plays with no poster', async () => {
    const fetchFn = vi.fn(async () => res([{ Name: 'Séries', Plays: 5 }])) as unknown as typeof fetch;
    expect(await getMostViewedLibraries(CFG, fetchFn)).toEqual([{ title: 'Séries', value: 5 }]);
  });

  it('getMostActiveUsers maps Name/Plays with no poster', async () => {
    const fetchFn = vi.fn(async () => res([{ Name: 'alice', Plays: 7, UserId: UID }])) as unknown as typeof fetch;
    expect(await getMostActiveUsers(CFG, fetchFn)).toEqual([{ title: 'alice', value: 7 }]);
  });
});

describe('getJellystatSessionsRaw', () => {
  it('proxies /proxy/getSessions and returns the raw array untouched', async () => {
    const raw = [{ UserName: 'alice', NowPlayingItem: { Id: UID } }];
    const fetchFn = vi.fn(async () => res(raw)) as unknown as typeof fetch;
    expect(await getJellystatSessionsRaw(CFG, fetchFn)).toEqual(raw);
    const [url] = calls(fetchFn)[0];
    expect(url).toBe('http://jellystat.local:3000/proxy/getSessions');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/lib/activity/jellystat.test.ts`
Expected: FAIL (module does not exist).

- [ ] **Step 3: Implement `src/lib/activity/jellystat.ts`**

```ts
import { timeoutSignal } from '../fetch-timeout';
import { withTtlCache, DEFAULT_CACHE_TTL_MS } from '../ttl-cache';
import { jellyfinPosterRef } from '../media/jellyfin';
import type { GlobalStat, RecentHistoryItem, WatchHistoryPage } from './types';

// Structural on purpose, matching media/jellyfin.ts's JellyfinProviderConfig —
// this module is never Edge-reachable (activity/ isn't imported by middleware.ts)
// but keeping the same shape avoids an unnecessary config.ts dependency anyway.
export interface JellystatConfig {
  url: string;
  apiKey: string;
}

// Verified against Jellystat 1.1.12 (2026-09-22): every call carries this header.
function jsHeaders(apiKey: string, json = false): Record<string, string> {
  const headers: Record<string, string> = { 'x-api-token': apiKey, Accept: 'application/json' };
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
}

async function jsGet<T>(cfg: JellystatConfig, path: string, fetchFn: typeof fetch): Promise<T> {
  const res = await fetchFn(`${cfg.url}${path}`, {
    headers: jsHeaders(cfg.apiKey),
    signal: timeoutSignal(),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Jellystat API request failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

async function jsPost<T>(cfg: JellystatConfig, path: string, body: unknown, fetchFn: typeof fetch): Promise<T> {
  const res = await fetchFn(`${cfg.url}${path}`, {
    method: 'POST',
    headers: jsHeaders(cfg.apiKey, true),
    body: JSON.stringify(body),
    signal: timeoutSignal(),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Jellystat API request failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export interface JellystatMemberActivity {
  userId: string;
  lastSeenAt: string | null;
}

interface RawMemberActivity {
  UserId: string;
  LastActivityDate?: string | null;
}

// GET /stats/getAllUserActivity returns every member's activity in one call —
// cached like Tautulli's own equivalent bulk fetch, so N per-member lastSeen()
// calls collapse into one real request per TTL window.
export async function listMemberActivity(cfg: JellystatConfig, fetchFn: typeof fetch = fetch): Promise<JellystatMemberActivity[]> {
  return withTtlCache(`jellystat-activity:${cfg.url}`, DEFAULT_CACHE_TTL_MS, async () => {
    const rows = await jsGet<RawMemberActivity[]>(cfg, '/stats/getAllUserActivity', fetchFn);
    return rows.map((r) => ({ userId: r.UserId, lastSeenAt: r.LastActivityDate ?? null }));
  });
}

interface RawHistoryResult {
  NowPlayingItemName?: string;
  SeriesName?: string | null;
  SeasonId?: string;
  NowPlayingItemId?: string;
  FullName?: string;
  ActivityDateInserted: string;
}

interface RawHistoryResponse {
  pages: number;
  size: number;
  results: RawHistoryResult[];
}

function historyRowToItem(row: RawHistoryResult): RecentHistoryItem {
  const isEpisode = row.SeriesName != null && row.SeriesName !== '';
  const posterItemId = isEpisode ? row.SeasonId : row.NowPlayingItemId;
  return {
    title: row.FullName ?? row.NowPlayingItemName ?? '',
    type: isEpisode ? 'episode' : 'movie',
    thumbPath: posterItemId ? jellyfinPosterRef(posterItemId) : '',
    watchedAt: row.ActivityDateInserted,
  };
}

// POST /api/getUserHistory — not cached (freshness matters more here than the
// dashboard-load-storm cost withTtlCache guards against, matching Tautulli's
// own getWatchHistoryPage). Unlike Tautulli's history endpoints, this API gives
// no per-type filter, so there is no movie/episode fairness balancing here —
// a documented simplification, not the Tautulli-specific bug this codebase
// already fixed once (see tautulli-source.ts's getRecentWatchHistory comment).
export async function getUserHistoryPage(
  cfg: JellystatConfig,
  userId: string,
  page: number,
  size: number,
  fetchFn: typeof fetch = fetch
): Promise<WatchHistoryPage> {
  const data = await jsPost<RawHistoryResponse>(
    cfg,
    `/api/getUserHistory?size=${size}&page=${page}&sort=ActivityDateInserted&desc=true`,
    { userid: userId },
    fetchFn
  );
  return { items: data.results.map(historyRowToItem), total: data.pages * data.size };
}

interface RawTopItem {
  Name: string;
  Plays?: number;
  unique_viewers?: number;
  Id?: string;
  UserId?: string;
}

const BOX_OFFICE_DAYS = 365;

export async function getMostViewedByType(
  cfg: JellystatConfig,
  type: 'Movie' | 'Series',
  fetchFn: typeof fetch = fetch
): Promise<GlobalStat[]> {
  return withTtlCache(`jellystat-viewed:${cfg.url}:${type}`, DEFAULT_CACHE_TTL_MS, async () => {
    const rows = await jsPost<RawTopItem[]>(cfg, '/stats/getMostViewedByType', { days: BOX_OFFICE_DAYS, type }, fetchFn);
    return rows.map((r) => ({ title: r.Name, value: r.Plays ?? 0, posterPath: r.Id ? jellyfinPosterRef(r.Id) : undefined }));
  });
}

export async function getMostPopularByType(
  cfg: JellystatConfig,
  type: 'Movie' | 'Series',
  fetchFn: typeof fetch = fetch
): Promise<GlobalStat[]> {
  return withTtlCache(`jellystat-popular:${cfg.url}:${type}`, DEFAULT_CACHE_TTL_MS, async () => {
    const rows = await jsPost<RawTopItem[]>(cfg, '/stats/getMostPopularByType', { days: BOX_OFFICE_DAYS, type }, fetchFn);
    return rows.map((r) => ({ title: r.Name, value: r.unique_viewers ?? 0, posterPath: r.Id ? jellyfinPosterRef(r.Id) : undefined }));
  });
}

export async function getMostViewedLibraries(cfg: JellystatConfig, fetchFn: typeof fetch = fetch): Promise<GlobalStat[]> {
  return withTtlCache(`jellystat-libraries:${cfg.url}`, DEFAULT_CACHE_TTL_MS, async () => {
    const rows = await jsPost<RawTopItem[]>(cfg, '/stats/getMostViewedLibraries', { days: BOX_OFFICE_DAYS }, fetchFn);
    return rows.map((r) => ({ title: r.Name, value: r.Plays ?? 0 }));
  });
}

export async function getMostActiveUsers(cfg: JellystatConfig, fetchFn: typeof fetch = fetch): Promise<GlobalStat[]> {
  return withTtlCache(`jellystat-active-users:${cfg.url}`, DEFAULT_CACHE_TTL_MS, async () => {
    const rows = await jsPost<RawTopItem[]>(cfg, '/stats/getMostActiveUsers', { days: BOX_OFFICE_DAYS }, fetchFn);
    return rows.map((r) => ({ title: r.Name, value: r.Plays ?? 0 }));
  });
}

// GET /proxy/getSessions live-proxies to Jellyfin's own /Sessions and returns
// the identical raw JSON (verified 2026-09-22) — the caller (jellystat-source.ts)
// reuses media/jellyfin.ts's normalizeJellyfinSessions on this, rather than this
// module re-implementing that mapping.
export async function getJellystatSessionsRaw(cfg: JellystatConfig, fetchFn: typeof fetch = fetch): Promise<unknown[]> {
  return jsGet<unknown[]>(cfg, '/proxy/getSessions', fetchFn);
}
```

- [ ] **Step 4: Run to verify it passes, then the whole suite**

```bash
npx vitest run tests/lib/activity/jellystat.test.ts 2>&1 | tail -20
npm run typecheck 2>&1 | tail -10
npx vitest run 2>&1 | tail -10
```

Expected: the new tests PASS; typecheck clean; whole suite green except the pre-existing failure.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add the low-level Jellystat API client" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Jellystat activity source + registry wiring

**Files:**
- Create: `src/lib/activity/jellystat-source.ts`
- Modify: `src/lib/activity/registry.ts`
- Test: `tests/lib/activity/jellystat-source.test.ts`; additions to `tests/lib/activity/registry.test.ts`

**Interfaces:**
- Consumes: every export of `jellystat.ts` (Task 4); `getJellystatSessionsRaw`; `normalizeJellyfinSessions` (Task 3, `media/jellyfin.ts`); `mapJellyfinSessionToActiveSession` (Task 3, `activity/jellyfin-native-source.ts`).
- Produces: `createJellystatActivitySource(cfg: JellystatConfig, fetchFn?: typeof fetch): ActivitySource`. `ActivityConfigSource` gains `jellyfin: { url: string; apiKey: string } | null`, `jellystat: JellystatConfig | null`, `jellyfinActivitySource: 'jellystat' | 'native'`.

- [ ] **Step 1: Write the failing tests**

`tests/lib/activity/jellystat-source.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createJellystatActivitySource } from '../../../src/lib/activity/jellystat-source';
import { resetTtlCacheForTests } from '../../../src/lib/ttl-cache';

const CFG = { url: 'http://jellystat.local:3000', apiKey: 'js-key' };
const UID = 'a'.repeat(32);
const MEMBER = { provider: 'jellyfin' as const, userId: UID, email: '', username: 'alice' };

beforeEach(() => {
  resetTtlCacheForTests();
});

function res(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

function routed(routes: Record<string, () => Response>): typeof fetch {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    const hit = Object.keys(routes).find((fragment) => url.includes(fragment));
    if (!hit) throw new Error(`unexpected fetch: ${url}`);
    return routes[hit]();
  }) as unknown as typeof fetch;
}

describe('createJellystatActivitySource', () => {
  it('identifies itself as the jellyfin source', () => {
    expect(createJellystatActivitySource(CFG, vi.fn()).id).toBe('jellyfin');
  });

  it('lastSeen matches the member by Jellyfin id', async () => {
    const fetchFn = routed({
      '/stats/getAllUserActivity': () => res([{ UserId: UID, LastActivityDate: '2026-05-18T13:53:12.541Z' }]),
    });
    const source = createJellystatActivitySource(CFG, fetchFn);
    expect(await source.lastSeen(MEMBER)).toBe('2026-05-18T13:53:12.541Z');
    expect(await source.lastSeen({ ...MEMBER, userId: 'b'.repeat(32) })).toBeNull();
  });

  it('recentHistory returns the first page of the member history, limited', async () => {
    const fetchFn = routed({
      '/api/getUserHistory': () =>
        res({ pages: 1, size: 8, results: [{ NowPlayingItemName: 'The Way', NowPlayingItemId: 'h'.repeat(32), ActivityDateInserted: '2026-05-17T09:00:00.000Z', FullName: 'The Way' }] }),
    });
    const source = createJellystatActivitySource(CFG, fetchFn);
    expect(await source.recentHistory(MEMBER, 8)).toEqual([
      { title: 'The Way', type: 'movie', thumbPath: `jellyfin:${'h'.repeat(32)}`, watchedAt: '2026-05-17T09:00:00.000Z' },
    ]);
  });

  it('historyPage forwards offset/limit as a 1-based page number', async () => {
    const fetchFn = routed({ '/api/getUserHistory': () => res({ pages: 2, size: 30, results: [] }) });
    const source = createJellystatActivitySource(CFG, fetchFn);
    await source.historyPage(MEMBER, 30, 30);
    const [url, init] = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('page=2');
    expect(url).toContain('size=30');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ userid: UID });
  });

  it('personalStats derives plays/duration from the member activity row', async () => {
    const fetchFn = routed({
      '/stats/getAllUserActivity': () => res([{ UserId: UID, LastActivityDate: null, TotalPlays: 7, TotalWatchTime: 10046 }]),
    });
    const source = createJellystatActivitySource(CFG, fetchFn);
    expect(await source.personalStats(MEMBER)).toEqual({ plays: 7, totalDurationSeconds: 10046 });
    expect(await source.personalStats({ ...MEMBER, userId: 'b'.repeat(32) })).toBeNull();
  });

  it('personalStatsByType is a deliberate simplification — no per-type split confirmed for Jellystat, returns zeros', async () => {
    const source = createJellystatActivitySource(CFG, vi.fn());
    expect(await source.personalStatsByType(MEMBER)).toEqual({ movies: { count: 0, hours: 0 }, episodes: { count: 0, hours: 0 } });
  });

  it('nowPlaying reuses the shared Jellyfin session mapping on the proxied raw sessions', async () => {
    const fetchFn = routed({
      '/proxy/getSessions': () =>
        res([
          {
            UserName: 'alice',
            DeviceName: 'Living Room TV',
            NowPlayingItem: { Id: UID, Name: 'Some Movie', Type: 'Movie', ProductionYear: 2024, RunTimeTicks: 72000000000 },
            PlayState: { IsPaused: false, PositionTicks: 6000000000, PlayMethod: 'DirectPlay' },
          },
        ]),
    });
    const source = createJellystatActivitySource(CFG, fetchFn);
    const sessions = await source.nowPlaying();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ title: 'Some Movie', user: 'alice', posterPath: `jellyfin:${UID}` });
  });

  it('globalStats assembles all four box-office categories and leaves platforms/concurrent empty', async () => {
    const fetchFn = routed({
      '/stats/getMostViewedByType': () => res([{ Name: 'Movie A', Plays: 3, Id: 'h'.repeat(32) }]),
      '/stats/getMostPopularByType': () => res([{ Name: 'Movie A', unique_viewers: 2, Id: 'h'.repeat(32) }]),
      '/stats/getMostViewedLibraries': () => res([{ Name: 'Films', Plays: 4 }]),
      '/stats/getMostActiveUsers': () => res([{ Name: 'alice', Plays: 7 }]),
    });
    const source = createJellystatActivitySource(CFG, fetchFn);
    const stats = await source.globalStats();
    expect(stats.topMovies).toEqual([{ title: 'Movie A', value: 3, posterPath: `jellyfin:${'h'.repeat(32)}` }]);
    expect(stats.popularMovies).toEqual([{ title: 'Movie A', value: 2, posterPath: `jellyfin:${'h'.repeat(32)}` }]);
    expect(stats.topLibraries).toEqual([{ title: 'Films', value: 4 }]);
    expect(stats.topUsers).toEqual([{ title: 'alice', value: 7 }]);
    expect(stats.topPlatforms).toEqual([]);
    expect(stats.mostConcurrent).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/lib/activity/jellystat-source.test.ts`
Expected: FAIL (module does not exist).

- [ ] **Step 3: Implement `src/lib/activity/jellystat-source.ts`**

```ts
import {
  getJellystatSessionsRaw,
  getMostActiveUsers,
  getMostPopularByType,
  getMostViewedByType,
  getMostViewedLibraries,
  getUserHistoryPage,
  listMemberActivity,
  type JellystatConfig,
} from './jellystat';
import { mapJellyfinSessionToActiveSession } from './jellyfin-native-source';
import { normalizeJellyfinSessions } from '../media/jellyfin';
import type { ActivitySource } from './types';

const normalizeId = (id: string) => id.toLowerCase().replace(/-/g, '');

export function createJellystatActivitySource(cfg: JellystatConfig, fetchFn: typeof fetch = fetch): ActivitySource {
  return {
    id: 'jellyfin',
    async nowPlaying() {
      const raw = await getJellystatSessionsRaw(cfg, fetchFn);
      return normalizeJellyfinSessions(raw).map(mapJellyfinSessionToActiveSession);
    },
    async lastSeen(member) {
      const activity = await listMemberActivity(cfg, fetchFn);
      const match = activity.find((a) => normalizeId(a.userId) === normalizeId(member.userId));
      return match?.lastSeenAt ?? null;
    },
    async personalStats(member) {
      // getAllUserActivity carries TotalPlays/TotalWatchTime per member — the same
      // cached call listMemberActivity already makes for lastSeen, re-fetched here
      // (still one real request per TTL window, withTtlCache-shared).
      const activity = await listMemberActivityWithTotals(cfg, fetchFn);
      const match = activity.find((a) => normalizeId(a.userId) === normalizeId(member.userId));
      return match ? { plays: match.totalPlays, totalDurationSeconds: match.totalWatchTime } : null;
    },
    // Jellystat's getAllUserActivity gives total plays/time, not a movies/episodes
    // split, and getUserHistory has no per-type filter to derive one from cheaply.
    // Deliberate simplification: no per-type stats for the Jellystat source.
    personalStatsByType: async () => ({ movies: { count: 0, hours: 0 }, episodes: { count: 0, hours: 0 } }),
    recentHistory: (member, limit) => getUserHistoryPage(cfg, member.userId, 1, limit, fetchFn).then((p) => p.items),
    historyPage: (member, offset, limit) => getUserHistoryPage(cfg, member.userId, Math.floor(offset / limit) + 1, limit, fetchFn),
    async globalStats() {
      const [topMovies, topTv, popularMovies, popularTv, topLibraries, topUsers] = await Promise.all([
        getMostViewedByType(cfg, 'Movie', fetchFn),
        getMostViewedByType(cfg, 'Series', fetchFn),
        getMostPopularByType(cfg, 'Movie', fetchFn),
        getMostPopularByType(cfg, 'Series', fetchFn),
        getMostViewedLibraries(cfg, fetchFn),
        getMostActiveUsers(cfg, fetchFn),
      ]);
      return { topMovies, popularMovies, topTv, popularTv, topLibraries, topUsers, topPlatforms: [], mostConcurrent: [] };
    },
  };
}
```

`listMemberActivityWithTotals` is not yet defined — `jellystat.ts`'s `listMemberActivity` (Task 4) only maps `userId`/`lastSeenAt`, dropping `TotalPlays`/`TotalWatchTime`. Rather than add a second, near-duplicate fetch function, widen `JellystatMemberActivity` in `jellystat.ts` itself:

Go back and edit `src/lib/activity/jellystat.ts` from Task 4:

```ts
export interface JellystatMemberActivity {
  userId: string;
  lastSeenAt: string | null;
  totalPlays: number;
  totalWatchTimeSeconds: number;
}

interface RawMemberActivity {
  UserId: string;
  LastActivityDate?: string | null;
  TotalPlays?: number;
  TotalWatchTime?: number;
}

export async function listMemberActivity(cfg: JellystatConfig, fetchFn: typeof fetch = fetch): Promise<JellystatMemberActivity[]> {
  return withTtlCache(`jellystat-activity:${cfg.url}`, DEFAULT_CACHE_TTL_MS, async () => {
    const rows = await jsGet<RawMemberActivity[]>(cfg, '/stats/getAllUserActivity', fetchFn);
    return rows.map((r) => ({
      userId: r.UserId,
      lastSeenAt: r.LastActivityDate ?? null,
      totalPlays: r.TotalPlays ?? 0,
      totalWatchTimeSeconds: r.TotalWatchTime ?? 0,
    }));
  });
}
```

Update `tests/lib/activity/jellystat.test.ts`'s two `listMemberActivity` test expectations to include `totalPlays: 0, totalWatchTimeSeconds: 0` (for the fixture with no `TotalPlays`/`TotalWatchTime`) and, for the first test's fixture (`TotalPlays: 7, TotalWatchTime: 10046`), `totalPlays: 7, totalWatchTimeSeconds: 10046`.

Then in `jellystat-source.ts`, delete the invented `listMemberActivityWithTotals` reference and use `listMemberActivity` directly in both `lastSeen` and `personalStats`:

```ts
    async personalStats(member) {
      const activity = await listMemberActivity(cfg, fetchFn);
      const match = activity.find((a) => normalizeId(a.userId) === normalizeId(member.userId));
      return match ? { plays: match.totalPlays, totalDurationSeconds: match.totalWatchTimeSeconds } : null;
    },
```

Update the Step 1 test `'personalStats derives plays/duration from the member activity row'` fixture and expectation stay as written (they already match this shape).

- [ ] **Step 4: Wire the registry**

In `src/lib/activity/registry.ts`, add `import { createJellyfinNativeActivitySource } from './jellyfin-native-source'; import { createJellystatActivitySource } from './jellystat-source'; import type { JellystatConfig } from './jellystat'; import type { JellyfinProviderConfig } from '../media/jellyfin';`, extend the config interface, and extend `getActivitySources`:

```ts
export interface ActivityConfigSource {
  tautulli: { url: string; apiKey: string } | null;
  jellyfin: JellyfinProviderConfig | null;
  jellystat: JellystatConfig | null;
  jellyfinActivitySource: 'jellystat' | 'native';
}

export function getActivitySources(config: ActivityConfigSource, fetchFn: typeof fetch = fetch): ActivitySource[] {
  const sources: ActivitySource[] = [];
  if (config.tautulli) {
    sources.push(createTautulliActivitySource(config.tautulli, fetchFn));
  }
  if (config.jellyfin) {
    if (config.jellyfinActivitySource === 'jellystat' && config.jellystat) {
      sources.push(createJellystatActivitySource(config.jellystat, fetchFn));
    } else {
      sources.push(createJellyfinNativeActivitySource(config.jellyfin, fetchFn));
    }
  }
  return sources;
}
```

- [ ] **Step 5: Extend the registry tests**

Append to `tests/lib/activity/registry.test.ts` (add the needed imports):

```ts
const JELLYFIN = { url: 'http://jellyfin.local:8096', apiKey: 'key' };
const JELLYSTAT = { url: 'http://jellystat.local:3000', apiKey: 'js-key' };

describe('jellyfin activity source selection', () => {
  it('uses the native source when jellystat is not the chosen source', () => {
    const sources = getActivitySources({ tautulli: TAUTULLI, jellyfin: JELLYFIN, jellystat: null, jellyfinActivitySource: 'native' });
    expect(sources.map((s) => s.id)).toEqual(['plex', 'jellyfin']);
  });

  it('uses jellystat when chosen and configured', () => {
    const sources = getActivitySources({ tautulli: TAUTULLI, jellyfin: JELLYFIN, jellystat: JELLYSTAT, jellyfinActivitySource: 'jellystat' });
    expect(sources.map((s) => s.id)).toEqual(['plex', 'jellyfin']);
  });

  it('falls back to native when jellystat is chosen but not configured', () => {
    const sources = getActivitySources({ tautulli: TAUTULLI, jellyfin: JELLYFIN, jellystat: null, jellyfinActivitySource: 'jellystat' });
    expect(sources).toHaveLength(2);
  });

  it('activates nothing for jellyfin when jellyfin itself is not configured', () => {
    const sources = getActivitySources({ tautulli: TAUTULLI, jellyfin: null, jellystat: JELLYSTAT, jellyfinActivitySource: 'jellystat' });
    expect(sources.map((s) => s.id)).toEqual(['plex']);
  });
});
```

Fix every existing test in this file that calls `getActivitySources({ tautulli: ... })` without the three new fields — TypeScript will flag them as missing properties. Add `jellyfin: null, jellystat: null, jellyfinActivitySource: 'native' as const` to each existing call's argument object.

Also fix `tests/lib/members.test.ts`'s `getActivitySources({ tautulli: { url: ..., apiKey: ... } })` call the same way.

- [ ] **Step 6: Run to verify, then the whole suite**

```bash
npx vitest run tests/lib/activity 2>&1 | tail -20
npm run typecheck 2>&1 | tail -10
npx vitest run 2>&1 | tail -10
```

Expected: all new/updated tests PASS; typecheck clean; whole suite green except the pre-existing failure.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add the Jellystat activity source and wire it into the registry" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Configuration — Jellystat service + activity-source choice

**Files:**
- Modify: `src/lib/config.ts`, `src/lib/settings-schema.ts`, `src/lib/connection-test.ts`, `src/lib/setup-steps.ts`, `src/components/ServiceSettingsForm.tsx`, `src/components/SetupWizard.tsx`, `src/components/AdminSettingsPanel.tsx`, `src/app/admin/settings/page.tsx`, `src/app/page.tsx`, `src/app/admin/members/page.tsx`, `src/app/api/dashboard/now-playing/route.ts`, `src/app/api/dashboard/stats/route.ts`, `src/app/api/history/route.ts`, `src/app/history/page.tsx`
- Test: `tests/lib/settings-schema.test.ts`, `tests/lib/connection-test.test.ts`, `tests/lib/setup-steps.test.ts`, `tests/lib/config.test.ts`

**Interfaces:**
- Consumes: `JellystatConfig` (Task 4).
- Produces: `AppConfig.jellystat: JellystatConfig | null`, `AppConfig.jellyfinActivitySource: 'jellystat' | 'native'`; `FieldDef` gains a `'select'` variant with `options`; `testJellystatConnection(url, apiKey, fetchFn?): Promise<ConnectionTestResult>`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/lib/settings-schema.test.ts`:

```ts
  it('covers exactly the 10 configurable groups', () => {
    expect(Object.keys(SERVICE_FIELDS).sort()).toEqual(
      ['jellyfin', 'jellyfinActivitySource', 'jellystat', 'overseerr', 'plex', 'publicBaseUrl', 'radarr', 'smtp', 'sonarr', 'tautulli'].sort()
    );
  });

  it('jellystat needs a url (text) and an api key (password)', () => {
    expect(SERVICE_FIELDS.jellystat.map((f) => [f.envKey, f.type])).toEqual([
      ['JELLYSTAT_URL', 'text'],
      ['JELLYSTAT_API_KEY', 'password'],
    ]);
  });

  it('jellyfinActivitySource is a select with native and jellystat options', () => {
    expect(SERVICE_FIELDS.jellyfinActivitySource).toEqual([
      {
        envKey: 'JELLYFIN_ACTIVITY_SOURCE',
        label: "Source d'activité Jellyfin",
        type: 'select',
        options: [
          { value: 'native', label: 'Natif (lecture en cours uniquement)' },
          { value: 'jellystat', label: 'Jellystat (statistiques et historique complets)' },
        ],
      },
    ]);
  });
```

(Change the existing `'covers exactly the 8 configurable groups'` test's title and expected array as shown — do not leave both the old and new assertion in the file.)

Append to `tests/lib/connection-test.test.ts` (add `testJellystatConnection` to its import):

```ts
describe('testJellystatConnection', () => {
  it('succeeds when the api-key endpoint answers 200, sending the x-api-token header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([{ name: 'CLAUDE', key: 'x' }]));
    const result = await testJellystatConnection('http://jellystat.local:3000/', 'js-key', fetchMock);
    expect(result).toEqual({ ok: true, error: null });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://jellystat.local:3000/api/keys');
    expect(init.headers['x-api-token']).toBe('js-key');
  });

  it('fails with the status code when Jellystat rejects the key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, false, 401));
    const result = await testJellystatConnection('http://jellystat.local:3000', 'bad', fetchMock);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('401');
  });

  it('reports a network error', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED'));
    const result = await testJellystatConnection('http://jellystat.local:3000', 'js-key', fetchMock);
    expect(result).toEqual({ ok: false, error: 'connect ECONNREFUSED' });
  });
});
```

Append to `tests/lib/setup-steps.test.ts` inside `describe('applyServiceSettings', ...)`:

```ts
  it('tests and persists the jellystat step on success', async () => {
    const db = getDb(':memory:');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
    const result = await applyServiceSettings(
      db,
      'jellystat',
      { JELLYSTAT_URL: 'http://jellystat.local:3000', JELLYSTAT_API_KEY: 'js-key' },
      { NODE_ENV: 'test' as const },
      fetchMock
    );
    expect(result).toEqual({ ok: true, error: null });
    expect(getSetting(db, 'JELLYSTAT_URL')).toBe('http://jellystat.local:3000');
  });

  it('persists the jellyfinActivitySource step with no connection test', async () => {
    const db = getDb(':memory:');
    const fetchMock = vi.fn();
    const result = await applyServiceSettings(
      db,
      'jellyfinActivitySource',
      { JELLYFIN_ACTIVITY_SOURCE: 'jellystat' },
      { NODE_ENV: 'test' as const },
      fetchMock
    );
    expect(result).toEqual({ ok: true, error: null });
    expect(getSetting(db, 'JELLYFIN_ACTIVITY_SOURCE')).toBe('jellystat');
    expect(fetchMock).not.toHaveBeenCalled();
  });
```

Append to `tests/lib/config.test.ts`:

```ts
describe('jellystat and activity-source config', () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it('jellystat is null when either field is missing', () => {
    expect(loadConfig(FULL_ENV, getDb(':memory:')).jellystat).toBeNull();
    resetDbForTests();
    expect(loadConfig({ ...FULL_ENV, JELLYSTAT_URL: 'http://js.local:3000' }, getDb(':memory:')).jellystat).toBeNull();
  });

  it('jellystat is loaded from env', () => {
    const config = loadConfig({ ...FULL_ENV, JELLYSTAT_URL: 'http://js.local:3000', JELLYSTAT_API_KEY: 'key' }, getDb(':memory:'));
    expect(config.jellystat).toEqual({ url: 'http://js.local:3000', apiKey: 'key' });
  });

  it('jellyfinActivitySource defaults to native and accepts jellystat', () => {
    expect(loadConfig(FULL_ENV, getDb(':memory:')).jellyfinActivitySource).toBe('native');
    resetDbForTests();
    expect(loadConfig({ ...FULL_ENV, JELLYFIN_ACTIVITY_SOURCE: 'jellystat' }, getDb(':memory:')).jellyfinActivitySource).toBe('jellystat');
  });

  it('an unrecognized jellyfinActivitySource value falls back to native', () => {
    expect(loadConfig({ ...FULL_ENV, JELLYFIN_ACTIVITY_SOURCE: 'bogus' }, getDb(':memory:')).jellyfinActivitySource).toBe('native');
  });

  it('never changes isSetupComplete', () => {
    const config = loadConfig({ ...FULL_ENV, JELLYSTAT_URL: 'http://js.local:3000', JELLYSTAT_API_KEY: 'key', JELLYFIN_ACTIVITY_SOURCE: 'jellystat' }, getDb(':memory:'));
    expect(isSetupComplete(config)).toBe(true);
  });
});
```

(`tests/lib/config.test.ts` already imports `beforeEach`, `resetDbForTests`, `getDb`, `loadConfig`, `isSetupComplete`, and defines `FULL_ENV` including `JELLYFIN_URL`/`JELLYFIN_API_KEY` from sub-project 2 — reuse it.)

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/lib/settings-schema.test.ts tests/lib/connection-test.test.ts tests/lib/setup-steps.test.ts tests/lib/config.test.ts`
Expected: FAIL (`jellystat`/`jellyfinActivitySource` service keys, `testJellystatConnection`, and `config.jellystat`/`config.jellyfinActivitySource` do not exist).

- [ ] **Step 3: `settings-schema.ts`**

Change `FieldDef` and add the two new service entries:

```ts
export interface FieldDef {
  envKey: string;
  label: string;
  type: 'text' | 'password' | 'select';
  options?: { value: string; label: string }[];
}

export type ServiceKey =
  | 'publicBaseUrl'
  | 'plex'
  | 'tautulli'
  | 'jellyfin'
  | 'jellystat'
  | 'jellyfinActivitySource'
  | 'sonarr'
  | 'radarr'
  | 'overseerr'
  | 'smtp';
```

In `SERVICE_FIELDS`, after the `jellyfin` entry:

```ts
  jellystat: [
    { envKey: 'JELLYSTAT_URL', label: 'URL Jellystat', type: 'text' },
    { envKey: 'JELLYSTAT_API_KEY', label: 'Clé API Jellystat (Réglages > Clés API)', type: 'password' },
  ],
  jellyfinActivitySource: [
    {
      envKey: 'JELLYFIN_ACTIVITY_SOURCE',
      label: "Source d'activité Jellyfin",
      type: 'select',
      options: [
        { value: 'native', label: 'Natif (lecture en cours uniquement)' },
        { value: 'jellystat', label: 'Jellystat (statistiques et historique complets)' },
      ],
    },
  ],
```

- [ ] **Step 4: `connection-test.ts` and `setup-steps.ts`**

In `src/lib/connection-test.ts`, after `testJellyfinConnection`:

```ts
export async function testJellystatConnection(
  url: string,
  apiKey: string,
  fetchFn: typeof fetch = fetch
): Promise<ConnectionTestResult> {
  try {
    const res = await fetchFn(`${url.replace(/\/+$/, '')}/api/keys`, {
      headers: { 'x-api-token': apiKey, Accept: 'application/json' },
      signal: timeoutSignal(),
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false, error: `Jellystat a répondu ${res.status} ${res.statusText}` };
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: messageFromError(err) };
  }
}
```

In `src/lib/setup-steps.ts`, add `testJellystatConnection` to the import from `./connection-test`, and in `runConnectionTest`'s switch, after the `'jellyfin'` case:

```ts
    case 'jellystat':
      return testJellystatConnection(resolved.JELLYSTAT_URL, resolved.JELLYSTAT_API_KEY, fetchFn);
    case 'jellyfinActivitySource':
      return { ok: true, error: null };
```

- [ ] **Step 5: `config.ts`**

Add after `JellyfinConfig`:

```ts
export interface JellystatConfig {
  url: string;
  apiKey: string;
}
```

Add to `AppConfig`, after `jellyfin: JellyfinConfig | null;`:

```ts
  jellystat: JellystatConfig | null;
  jellyfinActivitySource: 'jellystat' | 'native';
```

In `loadConfig`, after the `jellyfin` block:

```ts
  const jellystatUrl = v('JELLYSTAT_URL');
  const jellystatApiKey = v('JELLYSTAT_API_KEY');
  const jellystat: JellystatConfig | null =
    jellystatUrl && jellystatApiKey ? { url: jellystatUrl.replace(/\/+$/, ''), apiKey: jellystatApiKey } : null;

  const rawActivitySource = v('JELLYFIN_ACTIVITY_SOURCE');
  const jellyfinActivitySource: 'jellystat' | 'native' = rawActivitySource === 'jellystat' ? 'jellystat' : 'native';
```

And add `jellystat, jellyfinActivitySource,` to the returned object, right after `jellyfin,`.

Add `'JELLYSTAT_URL', 'JELLYSTAT_API_KEY', 'JELLYFIN_ACTIVITY_SOURCE',` to `CONFIGURABLE_KEYS`, after the `JELLYFIN_API_KEY` entry.

`isSetupComplete` and `ConfiguredAppConfig` are unchanged — `jellystat`/`jellyfinActivitySource` are always optional, never required.

- [ ] **Step 6: `ServiceSettingsForm.tsx` — render a `select` field**

In `src/components/ServiceSettingsForm.tsx`, change the initial `values` state to seed a select field with its first option's value:

```ts
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(
      fields.map((f) => [
        f.envKey,
        f.type === 'text' || f.type === 'select' ? initialValues?.[f.envKey] ?? (f.type === 'select' ? f.options![0].value : '') : '',
      ])
    )
  );
```

In the `fields.map((field) => ...)` render block, replace the single `<input .../>` with a branch:

```tsx
            {field.type === 'select' ? (
              <select
                value={values[field.envKey]}
                onChange={(e) => setValues({ ...values, [field.envKey]: e.target.value })}
                className="rounded-md border border-plexcrew-teal/20 bg-plexcrew-charcoal/60 px-3 py-2 text-plexcrew-screen"
              >
                {field.options!.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : (
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
            )}
```

- [ ] **Step 7: `SetupWizard.tsx` and `AdminSettingsPanel.tsx`**

In `src/components/SetupWizard.tsx`:

```ts
const STEPS: ServiceKey[] = ['publicBaseUrl', 'plex', 'tautulli', 'jellyfin', 'jellystat', 'jellyfinActivitySource', 'sonarr', 'radarr', 'overseerr', 'smtp'];

const STEP_TITLES: Record<ServiceKey, string> = {
  publicBaseUrl: 'URL publique',
  plex: 'Plex',
  tautulli: 'Tautulli',
  jellyfin: 'Jellyfin (optionnel)',
  jellystat: 'Jellystat (optionnel)',
  jellyfinActivitySource: "Source d'activité Jellyfin",
  sonarr: 'Sonarr',
  radarr: 'Radarr',
  overseerr: 'Overseerr',
  smtp: 'SMTP',
};
```

And in the `<ServiceSettingsForm>` JSX, change:

```tsx
        testable={step !== 'publicBaseUrl'}
```
to
```tsx
        testable={step !== 'publicBaseUrl' && step !== 'jellyfinActivitySource'}
```
and change:
```tsx
        onSkip={step === 'jellyfin' ? () => setStepIndex(stepIndex + 1) : undefined}
```
to
```tsx
        onSkip={step === 'jellyfin' || step === 'jellystat' ? () => setStepIndex(stepIndex + 1) : undefined}
```

In `src/components/AdminSettingsPanel.tsx`:

```ts
const SERVICE_TITLES: Record<ServiceKey, string> = {
  publicBaseUrl: 'URL publique',
  plex: 'Plex',
  tautulli: 'Tautulli',
  jellyfin: 'Jellyfin',
  jellystat: 'Jellystat',
  jellyfinActivitySource: "Source d'activité Jellyfin",
  sonarr: 'Sonarr',
  radarr: 'Radarr',
  overseerr: 'Overseerr',
  smtp: 'SMTP',
};

const SERVICES: ServiceKey[] = ['publicBaseUrl', 'plex', 'tautulli', 'jellyfin', 'jellystat', 'jellyfinActivitySource', 'sonarr', 'radarr', 'overseerr', 'smtp'];
```

And change `testable={service !== 'publicBaseUrl'}` to `testable={service !== 'publicBaseUrl' && service !== 'jellyfinActivitySource'}` on its `<ServiceSettingsForm>`.

- [ ] **Step 8: `app/admin/settings/page.tsx` — prefill the select too**

Change `if (field.type !== 'text') continue;` to `if (field.type !== 'text' && field.type !== 'select') continue;` — without this, the activity-source dropdown would always show "native" (the first option) on every page load regardless of what is actually stored.

- [ ] **Step 9: Pass `jellystat`/`jellyfinActivitySource` through every `getActivitySources` call site**

`getActivitySources` (Task 2/5) now requires `jellyfin`, `jellystat`, `jellyfinActivitySource` on its argument — every existing call site (`src/app/page.tsx`'s two call sites, `src/app/admin/members/page.tsx`, `src/app/api/dashboard/now-playing/route.ts`, `src/app/api/dashboard/stats/route.ts`, `src/app/api/history/route.ts`, `src/app/history/page.tsx`) already passes `config` (a `ConfiguredAppConfig`, which is a superset of `AppConfig` and therefore already carries `jellyfin`, `jellystat`, `jellyfinActivitySource` after Step 5) — **no call-site code changes are needed**, only `npm run typecheck` to confirm the structural match. If typecheck flags any call site, it means that call site is passing a narrower, hand-built object instead of the real `config` — fix it to pass `config` directly.

- [ ] **Step 10: Run to verify, then the whole suite and build**

```bash
npx vitest run tests/lib/settings-schema.test.ts tests/lib/connection-test.test.ts tests/lib/setup-steps.test.ts tests/lib/config.test.ts 2>&1 | tail -20
npm run typecheck 2>&1 | tail -20
npx vitest run 2>&1 | tail -15
SESSION_SECRET=verify-secret-0123456789abcdef0123456789 npm run build 2>&1 | tail -20
```

Expected: the new/updated tests PASS; typecheck clean; whole suite green except the pre-existing failure; `next build` succeeds.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: add Jellystat configuration and the Jellyfin activity-source choice" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Docs, final verification, optional live smoke test

**Files:**
- Modify: `.env.example`, `README.md`

- [ ] **Step 1: `.env.example`**

After the `JELLYFIN_API_KEY` lines, add:

```
# Jellyfin activity source (optional). Native (default) gives now-playing only.
# Jellystat gives full parity with Plex/Tautulli: now-playing, stats, history, Box Office.
# JELLYSTAT_URL=http://jellystat.example.com:3000
# JELLYSTAT_API_KEY=replace-with-jellystat-api-key
# JELLYFIN_ACTIVITY_SOURCE=native
```

- [ ] **Step 2: `README.md`**

In both the French and English configuration tables, after the `JELLYFIN_URL`, `JELLYFIN_API_KEY` row, add:

- French: ``| `JELLYSTAT_URL`, `JELLYSTAT_API_KEY`, `JELLYFIN_ACTIVITY_SOURCE` | assistant ou env (optionnel) | Statistiques et historique Jellyfin complets (sinon lecture en cours seule) |``
- English: ``| `JELLYSTAT_URL`, `JELLYSTAT_API_KEY`, `JELLYFIN_ACTIVITY_SOURCE` | wizard or env (optional) | Full Jellyfin stats and history (otherwise now-playing only) |``

In the "Jellyfin (optionnel)" / "Jellyfin (optional)" sub-sections added in sub-project 2 (just before "## Lancer en local" / "## Run locally"), append one paragraph to each:

- French: `Pour les statistiques, l'historique et le classement "Box Office" côté Jellyfin, configurez aussi Jellystat (`JELLYSTAT_URL`, `JELLYSTAT_API_KEY`) et choisissez la source d'activité "Jellystat" — sinon la lecture en cours reste la seule information disponible pour ces membres.`
- English: `For Jellyfin stats, history and the "Box Office" ranking, also configure Jellystat (`JELLYSTAT_URL`, `JELLYSTAT_API_KEY`) and pick the "Jellystat" activity source — otherwise now-playing is the only information available for those members.`

- [ ] **Step 3: Full verification**

```bash
npm run typecheck 2>&1 | tail -10
npx vitest run 2>&1 | tail -15
SESSION_SECRET=verify-secret-0123456789abcdef0123456789 npm run build 2>&1 | tail -20
grep -rn "lib/tautulli'\|lib/activity'\|tautulliLastSeen\|EMPTY_EXTENDED_STATS" src tests
git diff main..HEAD | grep -inE "bricefeniello|172\.18|/home/media|andaril|jellystat\.local|BEGIN (RSA|PRIVATE)" | grep -v "jellystat.local:3000"
```

Expected: typecheck clean; whole suite green except the pre-existing `dashboard-stats` failure; `next build` succeeds; the first grep prints nothing (every old name and path is gone); the second grep (secrets/PII scan, excluding the intentionally-fictional `jellystat.local:3000` test host) prints nothing.

- [ ] **Step 4: Optional live smoke test against a real Jellystat (controller-run, skip if unavailable)**

Only if the controller (not a dispatched implementer) has read-only access to a real Jellystat instance and its API key already in the session — never ask an implementer subagent to acquire or handle a live key. Build a throwaway script that imports `createJellystatActivitySource` and `createJellyfinNativeActivitySource`, calls `nowPlaying()`, `lastSeen(member)`, `recentHistory(member, 5)`, `globalStats()` against the real config, and prints only titles/counts — never the key. Compare against the verified facts in this plan's Global Constraints. Skip and say so in the report if no live server is available this session.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: document Jellystat and the Jellyfin activity-source choice" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Report (do not push)**

Report the commit list, test totals versus the baseline (only the pre-existing `dashboard-stats` failure remains), the `next build` result, and the live smoke-test outcome if run. Do not push and do not open a PR unless the user asks — this branch is not stacked on anything, so when they do, the PR targets `main` directly. No tag and no GitHub Release until the user explicitly approves, as with every previous release.
