import { headers } from 'next/headers';
import { loadConfig, isSetupComplete } from '@/lib/config';
import { getDb } from '@/lib/db';
import { getActiveProviders } from '@/lib/media/registry';
import type { ProviderId } from '@/lib/media/types';
import { PlexLoginButton } from '@/components/PlexLoginButton';
import { JellyfinLoginForm } from '@/components/JellyfinLoginForm';
import { getLocale } from '@/lib/i18n/locale';
import { t } from '@/lib/i18n/translate';
import type { Locale } from '@/lib/i18n/dictionaries';

// Reads the config at request time (which providers are active), so it can
// never be prerendered.
export const dynamic = 'force-dynamic';

export default function LoginPage() {
  // Before setup completes no provider is active; keep offering the Plex button, as this page always did.
  let active: ProviderId[] = ['plex'];
  let locale: Locale = 'fr';
  try {
    const db = getDb();
    const config = loadConfig(process.env, db);
    // Login is unauthenticated: instance default / browser language / FR.
    locale = getLocale(null, db, headers().get('accept-language'));
    if (isSetupComplete(config)) active = getActiveProviders(config).map((p) => p.id);
  } catch {
    // Unconfigured (no SESSION_SECRET / no DB): still offer the Plex button, as this page did before it
    // became a server component.
  }

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center gap-4 bg-cover bg-center"
      style={{ backgroundImage: "url('/login-background.jpg')" }}
    >
      <div className="mx-4 flex w-full max-w-sm flex-col items-center gap-5 rounded-2xl bg-plexcrew-ink/85 p-10 text-center shadow-2xl shadow-black/50 ring-1 ring-plexcrew-teal/30 backdrop-blur-md">
        <img src="/logo.png" alt="Portarr" className="h-24 w-24" />
        <h1 className="font-display text-4xl leading-none tracking-[0.1em] text-plexcrew-screen">
          Portarr
        </h1>
        {active.includes('plex') && <PlexLoginButton locale={locale} />}
        {active.includes('plex') && active.includes('jellyfin') && (
          <p className="text-xs uppercase tracking-wider text-plexcrew-ash">{t(locale, 'login.or')}</p>
        )}
        {active.includes('jellyfin') && <JellyfinLoginForm locale={locale} />}
      </div>
    </main>
  );
}
