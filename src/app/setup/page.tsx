import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db';
import { loadConfig, isSetupComplete, getConfigSources } from '@/lib/config';
import { verifySetupToken } from '@/lib/setup';
import { getSetting } from '@/lib/settings';
import { SetupWizard } from '@/components/SetupWizard';
import { getRequestLocale } from '@/lib/i18n/request-locale';
import { pickBrowserLocale } from '@/lib/i18n/locale';
import { t } from '@/lib/i18n/translate';

export const dynamic = 'force-dynamic';

export default function SetupPage({ searchParams }: { searchParams: { token?: string } }) {
  const db = getDb();
  const config = loadConfig(process.env, db);

  if (isSetupComplete(config)) {
    redirect('/admin/settings');
  }

  // Unauthenticated: no session, so instance default / browser language / FR.
  const locale = getRequestLocale(null, db);

  const queryToken = searchParams.token;
  if (queryToken && verifySetupToken(db, queryToken)) {
    const sources = getConfigSources(process.env, db);
    // First setup (no stored default yet): preselect the browser language.
    const showLanguageStep = getSetting(db, 'default_locale') === null;
    return (
      <SetupWizard
        token={queryToken}
        sources={sources}
        locale={showLanguageStep ? pickBrowserLocale(headers().get('accept-language')) : locale}
        showLanguageStep={showLanguageStep}
      />
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="font-display text-2xl text-plexcrew-screen">{t(locale, 'setup.requiredTitle')}</h1>
      <p className="text-sm text-plexcrew-ash">
        {t(locale, 'setup.requiredHintBefore')}
        <code>docker logs portarr</code>
        {t(locale, 'setup.requiredHintAfter')}
      </p>
    </main>
  );
}
