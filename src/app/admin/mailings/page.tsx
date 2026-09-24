import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { verifySession, SESSION_COOKIE_NAME } from '@/lib/session';
import { loadConfig, isSetupComplete } from '@/lib/config';
import { getDb } from '@/lib/db';
import { listMailTemplates } from '@/lib/mail-templates';
import { listMailLog } from '@/lib/mail-log';
import { listUsers } from '@/lib/members';
import { AdminMailTemplateForm } from '@/components/AdminMailTemplateForm';
import { AdminMailTemplateList } from '@/components/AdminMailTemplateList';
import { AdminMailHistory } from '@/components/AdminMailHistory';
import { AdminNewsletterPanel } from '@/components/AdminNewsletterPanel';
import { getLocale } from '@/lib/i18n/locale';
import { t } from '@/lib/i18n/translate';

export const dynamic = 'force-dynamic';

export default async function AdminMailingsPage() {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  const config = loadConfig(process.env, getDb());
  const sessionUser = token ? await verifySession(token, config.session.secret) : null;

  if (!sessionUser) {
    redirect('/login');
  }
  if (!sessionUser.isOwner) {
    redirect('/');
  }
  if (!isSetupComplete(config)) {
    redirect('/setup');
  }

  const db = getDb();
  const locale = getLocale(sessionUser, db);
  const mailTemplates = listMailTemplates(db);
  const mailLog = listMailLog(db);
  // A plain DB read (no Tautulli round-trip) is all the target picker needs —
  // see listUsers() in lib/members.ts, extracted from getMemberOverview for
  // exactly this: a mailing send doesn't need the provider-cross-referenced
  // activity data /admin/members displays.
  const users = listUsers(db);

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-6 sm:p-8">
      <header className="pc-glass-surface-strong sticky top-0 z-10 -mx-6 -mt-6 flex items-center justify-between gap-4 border-b border-plexcrew-teal/20 px-6 py-4 sm:-mx-8 sm:-mt-8 sm:px-8">
        <h1 className="font-display text-3xl leading-none tracking-[0.1em] text-plexcrew-screen">
          {t(locale, 'admin.mailingsTitle')}
        </h1>
        <Link
          href="/admin"
          className="flex-none rounded-md border border-plexcrew-teal/30 px-3 py-2 text-sm font-medium text-plexcrew-screen transition-colors hover:border-plexcrew-teal"
        >
          {t(locale, 'admin.backToAdmin')}
        </Link>
      </header>
      <section className="space-y-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-plexcrew-ash">
          {t(locale, 'admin.mailingSection')}
        </h2>
        <AdminMailTemplateForm locale={locale} />
        <AdminMailTemplateList
          templates={mailTemplates}
          members={users.map((u) => ({ email: u.email, username: u.username }))}
          locale={locale}
        />
      </section>
      <section className="space-y-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-plexcrew-ash">
          {t(locale, 'admin.sendHistorySection')}
        </h2>
        <AdminMailHistory entries={mailLog} locale={locale} />
      </section>
      <section className="space-y-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-plexcrew-ash">
          {t(locale, 'admin.newsletterSection')}
        </h2>
        <AdminNewsletterPanel locale={locale} />
      </section>
    </main>
  );
}
