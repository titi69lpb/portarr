import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { verifySession, SESSION_COOKIE_NAME } from '@/lib/session';
import { loadConfig } from '@/lib/config';
import { getDb } from '@/lib/db';
import { getMemberOverview } from '@/lib/members';
import { AdminMembersList } from '@/components/AdminMembersList';
import { AdminMemberSync } from '@/components/AdminMemberSync';

export const dynamic = 'force-dynamic';

export default async function AdminMembersPage() {
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
  const members = await getMemberOverview(db, config.tautulli.url, config.tautulli.apiKey);

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-6 sm:p-8">
      <header className="pc-glass-surface-strong sticky top-0 z-10 -mx-6 -mt-6 flex items-center justify-between gap-4 border-b border-plexcrew-teal/20 px-6 py-4 sm:-mx-8 sm:-mt-8 sm:px-8">
        <h1 className="font-display text-3xl leading-none tracking-[0.1em] text-plexcrew-screen">
          Membres
        </h1>
        <Link
          href="/admin"
          className="flex-none rounded-md border border-plexcrew-teal/30 px-3 py-2 text-sm font-medium text-plexcrew-screen transition-colors hover:border-plexcrew-teal"
        >
          ← Retour à l&apos;administration
        </Link>
      </header>
      <section className="space-y-5">
        <AdminMemberSync />
        <AdminMembersList members={members} />
      </section>
    </main>
  );
}
