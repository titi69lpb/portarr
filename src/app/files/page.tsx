import { cookies } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { verifySession, SESSION_COOKIE_NAME } from '@/lib/session';
import { loadConfig } from '@/lib/config';
import { AppSidebarServer } from '@/components/AppSidebarServer';
import {
  listDirectory,
  buildBreadcrumb,
  UnsafePathError,
  UpstreamUnavailableError,
  type FileEntry,
} from '@/lib/file-explorer';
import { formatFileSize } from '@/lib/file-size-formatter';

export const dynamic = 'force-dynamic';

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 flex-none">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </svg>
  );
}

export default async function FilesPage({
  searchParams,
}: {
  searchParams: { path?: string };
}) {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  const config = loadConfig();
  const sessionUser = token ? await verifySession(token, config.session.secret) : null;

  if (!sessionUser) {
    redirect('/login');
  }

  if (!config.filesRootPath) {
    notFound();
  }

  const relativePath = searchParams.path ?? '';
  const breadcrumb = buildBreadcrumb(relativePath);

  let entries: FileEntry[] = [];
  let dirNotFound = false;
  let unavailable = false;
  try {
    entries = await listDirectory(config.filesRootPath, relativePath, config.fsTimeoutMs);
  } catch (err) {
    if (err instanceof UnsafePathError) {
      dirNotFound = true;
    } else if (err instanceof UpstreamUnavailableError) {
      unavailable = true;
    } else {
      throw err;
    }
  }

  return (
    <>
      <AppSidebarServer />
      <main className="space-y-6 p-6 ml-16 sm:ml-40 sm:p-8">
        <header className="pc-glass-surface-strong sticky top-0 z-10 -mx-6 -mt-6 flex items-center justify-between gap-3 border-b border-plexcrew-teal/20 px-6 py-4 sm:-mx-8 sm:-mt-8 sm:px-8">
          <h1 className="font-display text-xl leading-none tracking-[0.06em] text-plexcrew-screen sm:text-3xl sm:tracking-[0.1em]">
            Fichiers
          </h1>
        </header>

        <nav className="flex flex-wrap items-center gap-1 text-sm text-plexcrew-ash">
          {breadcrumb.map((item, i) => (
            <span key={item.path} className="flex items-center gap-1">
              {i > 0 && <span>/</span>}
              <Link
                href={item.path ? `/files?path=${encodeURIComponent(item.path)}` : '/files'}
                className="hover:text-plexcrew-screen"
              >
                {item.name}
              </Link>
            </span>
          ))}
        </nav>

        {unavailable ? (
          <p className="text-sm text-plexcrew-ash">
            Stockage temporairement indisponible. Réessayez dans quelques instants.
          </p>
        ) : dirNotFound ? (
          <p className="text-sm text-plexcrew-ash">
            Dossier introuvable.{' '}
            <Link href="/files" className="text-plexcrew-teal hover:underline">
              Retour à la racine
            </Link>
          </p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-plexcrew-ash">Dossier vide.</p>
        ) : (
          <div className="pc-glass-surface overflow-x-auto rounded-lg p-4 ring-1 ring-plexcrew-teal/20">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-plexcrew-teal/20 text-xs font-semibold uppercase tracking-wider text-plexcrew-ash">
                  <th className="py-2 pr-4">Nom</th>
                  <th className="py-2 pr-4">Taille</th>
                  <th className="py-2">Modifié le</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.path} className="border-b border-plexcrew-teal/10 last:border-0">
                    <td className="py-2 pr-4 text-plexcrew-screen">
                      {entry.isDirectory ? (
                        <Link
                          href={`/files?path=${encodeURIComponent(entry.path)}`}
                          className="flex items-center gap-2 hover:text-plexcrew-amber"
                        >
                          <FolderIcon />
                          {entry.name}
                        </Link>
                      ) : (
                        <a
                          href={`/api/files/download?path=${encodeURIComponent(entry.path)}`}
                          className="hover:text-plexcrew-amber"
                        >
                          {entry.name}
                        </a>
                      )}
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs text-plexcrew-ash">
                      {entry.isDirectory ? '—' : formatFileSize(entry.sizeBytes)}
                    </td>
                    <td className="py-2 font-mono text-xs text-plexcrew-ash">
                      {new Date(entry.modifiedAt).toLocaleString('fr-FR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}
