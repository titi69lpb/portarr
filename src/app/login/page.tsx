import { loadConfig, isSetupComplete } from '@/lib/config';
import { getDb } from '@/lib/db';
import { getActiveProviders } from '@/lib/media/registry';
import type { ProviderId } from '@/lib/media/types';
import { PlexLoginButton } from '@/components/PlexLoginButton';
import { JellyfinLoginForm } from '@/components/JellyfinLoginForm';

// Reads the config at request time (which providers are active), so it can
// never be prerendered.
export const dynamic = 'force-dynamic';

export default function LoginPage() {
  const config = loadConfig(process.env, getDb());
  // Before setup completes no provider is active; keep offering the Plex
  // button, as this page always did.
  const active: ProviderId[] = isSetupComplete(config)
    ? getActiveProviders(config).map((p) => p.id)
    : ['plex'];

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
        {active.includes('plex') && <PlexLoginButton />}
        {active.includes('plex') && active.includes('jellyfin') && (
          <p className="text-xs uppercase tracking-wider text-plexcrew-ash">ou</p>
        )}
        {active.includes('jellyfin') && <JellyfinLoginForm />}
      </div>
    </main>
  );
}
