import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySession, SESSION_COOKIE_NAME } from '@/lib/session';
import { loadConfig } from '@/lib/config';
import { AppSidebarServer } from '@/components/AppSidebarServer';
import { SpeedTestRunner } from '@/components/SpeedTestRunner';

export const dynamic = 'force-dynamic';

export default async function SpeedTestPage() {
  const config = loadConfig();
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  const sessionUser = token ? await verifySession(token, config.session.secret) : null;

  if (!sessionUser) {
    redirect('/login');
  }

  return (
    <>
      <AppSidebarServer />
      <main className="mx-auto max-w-3xl space-y-8 p-6 ml-16 sm:ml-40 sm:p-8">
        <header className="pc-glass-surface-strong sticky top-0 z-10 -mx-6 -mt-6 flex items-center justify-between gap-4 border-b border-plexcrew-teal/20 px-6 py-4 sm:-mx-8 sm:-mt-8 sm:px-8">
          <h1 className="font-display text-3xl leading-none tracking-[0.1em] text-plexcrew-screen">
            Test de vitesse
          </h1>
        </header>
        <p className="text-sm text-plexcrew-ash">
          Mesurez le débit et la latence entre votre appareil et le serveur du portail.
        </p>
        <div className="pc-glass-surface flex flex-col items-center gap-6 rounded-lg p-8 ring-1 ring-plexcrew-teal/20">
          <SpeedTestRunner />
        </div>
      </main>
    </>
  );
}
