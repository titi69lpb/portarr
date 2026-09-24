import { cookies, headers } from 'next/headers';
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
import { redirect } from 'next/navigation';
import { verifySession, SESSION_COOKIE_NAME, type SessionUser } from '@/lib/session';
import { loadConfig, isSetupComplete, assertConfigured, type ConfiguredAppConfig } from '@/lib/config';
import { nowPlayingAll, globalStatsAll } from '@/lib/activity/aggregate';
import { getActivitySources, getActivitySourceFor } from '@/lib/activity/registry';
import { getActiveProviders } from '@/lib/media/registry';
import { recentlyAddedSplitAll } from '@/lib/media/aggregate';
import type { RecentlyAddedSplit } from '@/lib/media/types';
import { getUpcomingReleases, type CalendarItem } from '@/lib/calendar';
import { getPendingRequests, type PendingRequest } from '@/lib/overseerr';
import type { ActiveSession, GlobalStat, PersonalStats, PersonalStatsByType, RecentHistoryItem, StatCategory } from '@/lib/activity/types';
import { EMPTY_GLOBAL_STATS } from '@/lib/activity/types';
import { getDb } from '@/lib/db';
import { getActiveAnnouncement } from '@/lib/announcements';
import { renderMarkdown } from '@/lib/markdown';
import { getKumaStatus, type KumaStatus } from '@/lib/kuma';
import { KumaStatusBadge } from '@/components/KumaStatusBadge';
import { getLocale } from '@/lib/i18n/locale';

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

async function loadStats(sessionUser: SessionUser | null, config: ConfiguredAppConfig) {
  const sources = getActivitySources(config);
  const extended = await globalStatsAll(sources);

  let personal: PersonalStats | null = null;
  let personalByType: PersonalStatsByType | null = null;
  let recentHistory: RecentHistoryItem[] = [];
  if (sessionUser) {
    const source = getActivitySourceFor(sources, sessionUser.provider);
    if (source) {
      personal = await source.personalStats(sessionUser);
      if (personal !== null) {
        [personalByType, recentHistory] = await Promise.all([
          source.personalStatsByType(sessionUser),
          source.recentHistory(sessionUser, 8),
        ]);
      }
    }
  }

  return { personal, extended, personalByType, recentHistory };
}

export default async function DashboardPage() {
  const rawConfig = loadConfig(process.env, getDb());
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  const sessionUser = token ? await verifySession(token, rawConfig.session.secret) : null;
  const isOwner = sessionUser?.isOwner ?? false;
  const locale = getLocale(sessionUser, getDb(), headers().get('accept-language'));

  if (!isSetupComplete(rawConfig)) {
    redirect('/setup');
  }
  const config = assertConfigured(rawConfig);

  const calendarStart = new Date();
  const calendarEnd = new Date();
  calendarEnd.setDate(calendarEnd.getDate() + 14);

  const [nowPlaying, recentlyAdded, calendar, pendingRequests, stats, announcement, kumaStatus] = await Promise.all([
    safe<ActiveSession[]>('now-playing', [], () => nowPlayingAll(getActivitySources(config))),
    safe<RecentlyAddedSplit>('recently-added', { movies: [], episodes: [] }, () =>
      recentlyAddedSplitAll(getActiveProviders(config), 15)
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
        extended: EMPTY_GLOBAL_STATS,
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
      <AppSidebarServer locale={locale} />
      <main className="space-y-10 p-6 ml-16 sm:ml-40 sm:p-8">
        <header className="pc-glass-surface-strong sticky top-0 z-10 -mx-6 -mt-6 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-plexcrew-teal/20 px-6 py-4 sm:-mx-8 sm:-mt-8 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <img src="/logo.png" alt="Portarr" className="h-10 w-10 flex-none" />
            <div className="flex min-w-0 flex-col gap-1">
              <h1 className="font-display text-xl leading-none tracking-[0.06em] text-plexcrew-screen sm:text-3xl sm:tracking-[0.1em]">
                Portarr
              </h1>
              <KumaStatusBadge status={kumaStatus} locale={locale} />
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
            <NewsletterSubscriptionToggle locale={locale} />
            <LogoutButton locale={locale} />
          </div>
        </header>
        <AnnouncementBanner html={announcementData.announcement?.contentHtml ?? null} locale={locale} />
        <DashboardSections
          locale={locale}
          sections={[
            { id: 'now-playing', node: <NowPlaying sessions={nowPlaying} locale={locale} /> },
            {
              id: 'recently-added',
              node: (
                <RecentlyAdded
                  movies={recentlyAdded.movies}
                  episodes={recentlyAdded.episodes}
                  locale={locale}
                />
              ),
            },
            { id: 'calendar', node: <ReleaseCalendar items={calendar} locale={locale} /> },
            { id: 'stats-global', node: <StatsGlobal extended={stats.extended} locale={locale} /> },
            { id: 'pending-requests', node: <PendingRequests requests={pendingRequests} locale={locale} /> },
            {
              id: 'stats-personal',
              node: (
                <StatsPersonal
                  stats={stats.personal}
                  byType={stats.personalByType}
                  recentHistory={stats.recentHistory}
                  locale={locale}
                />
              ),
            },
          ]}
        />
      </main>
    </>
  );
}
