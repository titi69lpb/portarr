import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { verifySession, SESSION_COOKIE_NAME } from '@/lib/session';
import { loadConfig, isSetupComplete, getConfigSources, resolveConfigValue } from '@/lib/config';
import { getDb } from '@/lib/db';
import { SERVICE_FIELDS } from '@/lib/settings-schema';
import { AdminSettingsPanel } from '@/components/AdminSettingsPanel';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  const db = getDb();
  const config = loadConfig(process.env, db);
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

  const sources = getConfigSources(process.env, db);

  // Pre-fill text fields (URLs, names — never secrets) with their currently
  // resolved value so the owner isn't forced to retype them to change just
  // one field of a service. Password fields are intentionally left out: the
  // client never sees a real secret, only the "already configured" hint
  // (see configuredKeys in AdminSettingsPanel / ServiceSettingsForm).
  const initialValues: Record<string, string> = {};
  for (const fields of Object.values(SERVICE_FIELDS)) {
    for (const field of fields) {
      if (field.type !== 'text' && field.type !== 'select') continue;
      const value = resolveConfigValue(field.envKey, process.env, db);
      if (value) initialValues[field.envKey] = value;
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-6 sm:p-8">
      <header className="pc-glass-surface-strong sticky top-0 z-10 -mx-6 -mt-6 flex items-center justify-between gap-4 border-b border-plexcrew-teal/20 px-6 py-4 sm:-mx-8 sm:-mt-8 sm:px-8">
        <h1 className="font-display text-3xl leading-none tracking-[0.1em] text-plexcrew-screen">Réglages</h1>
        <Link
          href="/admin"
          className="flex-none rounded-md border border-plexcrew-teal/30 px-3 py-2 text-sm font-medium text-plexcrew-screen transition-colors hover:border-plexcrew-teal"
        >
          ← Retour à l&apos;administration
        </Link>
      </header>
      <AdminSettingsPanel sources={sources} initialValues={initialValues} />
    </main>
  );
}
