import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db';
import { loadConfig, isSetupComplete, getConfigSources } from '@/lib/config';
import { verifySetupToken } from '@/lib/setup';
import { SetupWizard } from '@/components/SetupWizard';

export const dynamic = 'force-dynamic';

export default function SetupPage({ searchParams }: { searchParams: { token?: string } }) {
  const db = getDb();
  const config = loadConfig(process.env, db);

  if (isSetupComplete(config)) {
    redirect('/admin/settings');
  }

  const queryToken = searchParams.token;
  if (queryToken && verifySetupToken(db, queryToken)) {
    const sources = getConfigSources(process.env, db);
    return <SetupWizard token={queryToken} sources={sources} />;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="font-display text-2xl text-plexcrew-screen">Configuration requise</h1>
      <p className="text-sm text-plexcrew-ash">
        Consultez les logs du conteneur (<code>docker logs portarr</code>) pour trouver le lien de configuration initiale.
      </p>
    </main>
  );
}
