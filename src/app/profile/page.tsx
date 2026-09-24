import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySession, SESSION_COOKIE_NAME } from '@/lib/session';
import { loadConfig } from '@/lib/config';
import { getDb } from '@/lib/db';
import { getUserPersonalLocale } from '@/lib/i18n/locale';
import { getRequestLocale } from '@/lib/i18n/request-locale';
import { t } from '@/lib/i18n/translate';
import { AppSidebarServer } from '@/components/AppSidebarServer';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

export const dynamic = 'force-dynamic';

// Open to every logged-in user (not owner-gated): personal settings, currently
// just the language preference.
export default async function ProfilePage() {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  const db = getDb();
  const config = loadConfig(process.env, db);
  const sessionUser = token ? await verifySession(token, config.session.secret) : null;

  if (!sessionUser) {
    redirect('/login');
  }

  const locale = getRequestLocale(sessionUser, db);
  const hasPersonalOverride = getUserPersonalLocale(sessionUser, db) !== null;

  return (
    <>
      <AppSidebarServer locale={locale} />
      <main className="mx-auto ml-16 max-w-3xl space-y-8 p-6 sm:ml-40 sm:p-8">
        <header className="pc-glass-surface-strong sticky top-0 z-10 -mx-6 -mt-6 flex items-center justify-between gap-4 border-b border-plexcrew-teal/20 px-6 py-4 sm:-mx-8 sm:-mt-8 sm:px-8">
          <h1 className="font-display text-3xl leading-none tracking-[0.1em] text-plexcrew-screen">
            {t(locale, 'profile.title')}
          </h1>
        </header>
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-plexcrew-ash">
            {t(locale, 'profile.language')}
          </h2>
          <div className="pc-glass-surface space-y-3 rounded-lg p-5 ring-1 ring-plexcrew-teal/20">
            <p className="text-sm text-plexcrew-ash">{t(locale, 'profile.languageDescription')}</p>
            <LanguageSwitcher locale={locale} hasPersonalOverride={hasPersonalOverride} />
          </div>
        </section>
        <p className="text-xs text-plexcrew-ash">{t(locale, 'profile.moreSoon')}</p>
      </main>
    </>
  );
}
