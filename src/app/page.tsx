import { cookies } from 'next/headers';
import Link from 'next/link';
import { NowPlaying } from '@/components/NowPlaying';
import { RecentlyAdded } from '@/components/RecentlyAdded';
import { ReleaseCalendar } from '@/components/ReleaseCalendar';
import { PendingRequests } from '@/components/PendingRequests';
import { StatsGlobal } from '@/components/StatsGlobal';
import { StatsPersonal } from '@/components/StatsPersonal';
import { AppSidebarServer } from '@/components/AppSidebarServer';
import { LogoutButton } from '@/components/LogoutButton';
import { NewsletterSubscriptionToggle } from '@/components/NewsletterSubscriptionToggle';
import { AnnouncementBanner } from '@/components/AnnouncementBanner';
import { DashboardSections } from '@/components/DashboardSections';
import { verifySession, SESSION_COOKIE_NAME, type SessionUser } from '@/lib/session';
import { loadConfig } from '@/lib/config';
import { getActiveSessions, type ActiveSession } from '@/lib/activity';
import { getRecentlyAddedSplit, type RecentlyAddedSplit } from '@/lib/plex';
import { getUpcomingReleases, type CalendarItem } from '@/lib/calendar';
import { getPendingRequests, type PendingRequest } from '@/lib/overseerr';
import {
  getPersonalStats,
  getExtendedStats,
  getPersonalStatsByType,
  getUserIdByEmail,
  getRecentWatchHistory,
  type GlobalStat,
  type PersonalStats,
  type PersonalStatsByType,
  type RecentHistoryItem,
  type StatCategory,
} from '@/lib/tautulli';
import { getDb } from '@/lib/db';
import { getActiveAnnouncement } from '@/lib/announcements';
import { renderMarkdown } from '@/lib/markdown';
import { getKumaStatus, type KumaStatus } from '@/lib/kuma';
import { KumaStatusBadge } from '@/components/KumaStatusBadge';

// Every widget below used to be its own `/api/dashboard/*` route, self-fetched
// over HTTP by this page (localhost round-trip, cookie forwarded by hand) —
// pure overhead, since nothing outside this page ever calls those routes
// (they stayed as routes for their own unit tests / API surface, see
// docs/architecture.md). Calling the lib/ functions directly removes that
// round-trip and the duplicate session-cookie parsing the /stats route used
// to do on its own.
// Explicit, rather than relying on cookies()/headers() usage below to force
// this implicitly (the previous version did that incidentally — and got it
// right only because loadConfig() happened to run after the first
// dynamic-triggering call; moving it earlier during this refactor broke that
// implicit ordering and turned a missing env var into a hard build failure
// instead of Next.js's normal "mark this route dynamic" bailout).
export const dynamic = 'force-dynamic';

async function safe<T>(label: string, fallback: T, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error(`Failed to load ${label}:`, err);
    return fallback;
  }
}

const EMPTY_EXTENDED_STATS: Record<StatCategory, GlobalStat[]> = {
  topMovies: [],
  popularMovies: [],
  topTv: [],
  popularTv: [],
  topLibraries: [],
  topUsers: [],
  topPlatforms: [],
  mostConcurrent: [],
};

async function loadStats(sessionUser: SessionUser | null, config: ReturnType<typeof loadConfig>) {
  const extended = await getExtendedStats(config.tautulli.url, config.tautulli.apiKey);
  const personal = sessionUser
    ? await getPersonalStats(config.tautulli.url, config.tautulli.apiKey, sessionUser.email)
    : null;

  let personalByType: PersonalStatsByType | null = null;
  let recentHistory: RecentHistoryItem[] = [];
  if (sessionUser) {
    const userId = await getUserIdByEmail(config.tautulli.url, config.tautulli.apiKey, sessionUser.email);
    if (userId !== null) {
      [personalByType, recentHistory] = await Promise.all([
        getPersonalStatsByType(config.tautulli.url, config.tautulli.apiKey, userId),
        getRecentWatchHistory(config.tautulli.url, config.tautulli.apiKey, userId),
      ]);
    }
  }

  return { personal, extended, personalByType, recentHistory };
}

export default async function DashboardPage() {
  const config = loadConfig();
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  const sessionUser = token ? await verifySession(token, config.session.secret) : null;
  const isOwner = sessionUser?.isOwner ?? false;

  const calendarStart = new Date();
  const calendarEnd = new Date();
  calendarEnd.setDate(calendarEnd.getDate() + 14);

  const [nowPlaying, recentlyAdded, calendar, pendingRequests, stats, announcement, kumaStatus] = await Promise.all([
    safe<ActiveSession[]>('now-playing', [], () =>
      getActiveSessions(config.tautulli.url, config.tautulli.apiKey)
    ),
    safe<RecentlyAddedSplit>('recently-added', { movies: [], episodes: [] }, () =>
      getRecentlyAddedSplit(config.plex.url, config.plex.serverToken, 15)
    ),
    safe<CalendarItem[]>('calendar', [], async () => {
      const items = await getUpcomingReleases(config.sonarr, config.radarr, calendarStart, calendarEnd);
      return items.filter((item) => item.releaseDate !== '');
    }),
    safe<PendingRequest[]>('pending-requests', [], () =>
      getPendingRequests(config.overseerr.url, config.overseerr.apiKey)
    ),
    safe(
      'stats',
      {
        personal: null as PersonalStats | null,
        extended: EMPTY_EXTENDED_STATS,
        personalByType: null as PersonalStatsByType | null,
        recentHistory: [] as RecentHistoryItem[],
      },
      () => loadStats(sessionUser, config)
    ),
    safe<{ contentHtml: string } | null>('active-announcement', null, async () => {
      const db = getDb();
      const active = getActiveAnnouncement(db);
      return active ? { contentHtml: renderMarkdown(active.contentMarkdown) } : null;
    }),
    safe<KumaStatus | null>('kuma-status', null, () =>
      config.kuma ? getKumaStatus(config.kuma.url, config.kuma.apiKey) : Promise.resolve(null)
    ),
  ]);
  const announcementData = { announcement };

  return (
    <>
      <AppSidebarServer />
      <main className="space-y-10 p-6 ml-16 sm:ml-40 sm:p-8">
        <header className="pc-glass-surface-strong sticky top-0 z-10 -mx-6 -mt-6 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-plexcrew-teal/20 px-6 py-4 sm:-mx-8 sm:-mt-8 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <img src="/logo.png" alt="Portarr" className="h-10 w-10 flex-none" />
            <div className="flex min-w-0 flex-col gap-1">
              <h1 className="font-display text-xl leading-none tracking-[0.06em] text-plexcrew-screen sm:text-3xl sm:tracking-[0.1em]">
                Portarr
              </h1>
              <KumaStatusBadge status={kumaStatus} />
            </div>
          </div>
          {/* w-full on wrap (narrow viewports where the title alone already
              fills the row) forces this onto its own line instead of
              overlapping the title — caught on a real mobile screenshot, not
              by reasoning about the classes: "Portarr" wrapped to two
              lines and sat on top of "Admin / Newsletter / Déconnexion". */}
          <div className="flex w-full flex-none items-center justify-end gap-4 sm:w-auto sm:gap-5">
            {isOwner && (
              <Link
                href="/admin"
                className="rounded text-sm font-medium text-plexcrew-ash transition-colors hover:text-plexcrew-screen"
              >
                Admin
              </Link>
            )}
            <NewsletterSubscriptionToggle />
            <LogoutButton />
          </div>
        </header>
        <AnnouncementBanner html={announcementData.announcement?.contentHtml ?? null} />
        <DashboardSections
          sections={[
            { id: 'now-playing', node: <NowPlaying sessions={nowPlaying} /> },
            {
              id: 'recently-added',
              node: <RecentlyAdded movies={recentlyAdded.movies} episodes={recentlyAdded.episodes} />,
            },
            { id: 'calendar', node: <ReleaseCalendar items={calendar} /> },
            { id: 'stats-global', node: <StatsGlobal extended={stats.extended} /> },
            { id: 'pending-requests', node: <PendingRequests requests={pendingRequests} /> },
            {
              id: 'stats-personal',
              node: (
                <StatsPersonal
                  stats={stats.personal}
                  byType={stats.personalByType}
                  recentHistory={stats.recentHistory}
                />
              ),
            },
          ]}
        />
      </main>
    </>
  );
}
