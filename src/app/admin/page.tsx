import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { verifySession, SESSION_COOKIE_NAME } from '@/lib/session';
import { loadConfig } from '@/lib/config';
import { getDb } from '@/lib/db';
import { listAnnouncements } from '@/lib/announcements';
import { getVolumeStats, combineVolumeStats } from '@/lib/storage';
import { AdminAnnouncementForm } from '@/components/AdminAnnouncementForm';
import { AdminAnnouncementList } from '@/components/AdminAnnouncementList';
import { AdminStorageBars } from '@/components/AdminStorageBar';

export const dynamic = 'force-dynamic';

function AdminNavCard({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <Link
      href={href}
      className="pc-glass-surface flex flex-col gap-1 rounded-lg p-5 ring-1 ring-plexcrew-teal/15 transition hover:ring-plexcrew-amber/40"
    >
      <span className="font-display text-lg tracking-[0.06em] text-plexcrew-screen">{title} →</span>
      <span className="text-sm text-plexcrew-ash">{description}</span>
    </Link>
  );
}

export default async function AdminPage() {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  const config = loadConfig();
  const sessionUser = token ? await verifySession(token, config.session.secret) : null;

  if (!sessionUser) {
    redirect('/login');
  }
  if (!sessionUser.isOwner) {
    redirect('/');
  }

  const db = getDb();
  const announcements = listAnnouncements(db);
  const volumeStats = getVolumeStats(config.storageVolumes);
  const combinedStorage = combineVolumeStats(volumeStats);

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-6 sm:p-8">
      <header className="pc-glass-surface-strong sticky top-0 z-10 -mx-6 -mt-6 flex items-center justify-between gap-4 border-b border-plexcrew-teal/20 px-6 py-4 sm:-mx-8 sm:-mt-8 sm:px-8">
        <h1 className="font-display text-3xl leading-none tracking-[0.1em] text-plexcrew-screen">
          Administration
        </h1>
        <Link
          href="/"
          className="flex-none rounded-md border border-plexcrew-teal/30 px-3 py-2 text-sm font-medium text-plexcrew-screen transition-colors hover:border-plexcrew-teal"
        >
          ← Retour au portail
        </Link>
      </header>
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <AdminNavCard href="/admin/members" title="Membres" description="Synchronisation Plex, activité, opt-in newsletter" />
        <AdminNavCard href="/admin/mailings" title="Mailings" description="Modèles, envoi, historique, newsletter" />
      </section>
      {config.storageVolumes.length > 0 && (
        <section className="space-y-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-plexcrew-ash">
            Stockage
          </h2>
          <AdminStorageBars combined={combinedStorage} volumes={volumeStats} />
        </section>
      )}
      <section className="space-y-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-plexcrew-ash">
          Annonces
        </h2>
        <AdminAnnouncementForm />
        <AdminAnnouncementList announcements={announcements} />
      </section>
    </main>
  );
}
