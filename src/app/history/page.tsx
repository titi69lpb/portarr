import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySession, SESSION_COOKIE_NAME } from '@/lib/session';
import { loadConfig } from '@/lib/config';
import { getUserIdByEmail, getWatchHistoryPage } from '@/lib/tautulli';
import { AppSidebarServer } from '@/components/AppSidebarServer';
import { HistoryLoadMore } from '@/components/HistoryLoadMore';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 30;

export default async function HistoryPage() {
  const config = loadConfig();
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  const sessionUser = token ? await verifySession(token, config.session.secret) : null;

  if (!sessionUser) {
    redirect('/login');
  }

  let items: Awaited<ReturnType<typeof getWatchHistoryPage>>['items'] = [];
  let total = 0;
  try {
    const userId = await getUserIdByEmail(config.tautulli.url, config.tautulli.apiKey, sessionUser.email);
    if (userId !== null) {
      const page = await getWatchHistoryPage(config.tautulli.url, config.tautulli.apiKey, userId, 0, PAGE_SIZE);
      items = page.items;
      total = page.total;
    }
  } catch (err) {
    console.error('Failed to load watch history page:', err);
  }

  return (
    <>
      <AppSidebarServer />
      <main className="space-y-6 p-6 ml-16 sm:ml-40 sm:p-8">
        <header className="pc-glass-surface-strong sticky top-0 z-10 -mx-6 -mt-6 flex items-center justify-between gap-3 border-b border-plexcrew-teal/20 px-6 py-4 sm:-mx-8 sm:-mt-8 sm:px-8">
          <h1 className="font-display text-xl leading-none tracking-[0.06em] text-plexcrew-screen sm:text-3xl sm:tracking-[0.1em]">
            Mon historique
          </h1>
        </header>
        <HistoryLoadMore initialItems={items} initialTotal={total} />
      </main>
    </>
  );
}
