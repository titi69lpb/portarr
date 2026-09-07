'use client';

import Link from 'next/link';
import { GlobalSearch } from '@/components/GlobalSearch';
import type { ShortcutConfig } from '@/lib/config';

export function AppSidebar({
  shortcuts,
  filesEnabled,
}: {
  shortcuts: ShortcutConfig[];
  filesEnabled: boolean;
}) {
  return (
    <aside className="pc-glass-surface-strong fixed left-0 top-0 flex h-screen w-16 flex-col items-center gap-4 border-r border-plexcrew-teal/15 py-6 sm:w-40 sm:items-stretch sm:px-3">
      <Link
        href="/"
        className="flex items-center gap-2 rounded-lg px-2 py-2 text-plexcrew-screen transition hover:bg-plexcrew-teal/10 hover:text-plexcrew-amber"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5 flex-none">
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
        </svg>
        <span className="hidden truncate text-xs font-medium sm:inline">Portail</span>
      </Link>
      <GlobalSearch />
      <div className="mb-2 w-full border-b border-plexcrew-teal/15 sm:mx-2 sm:w-auto" />

      {shortcuts.map((s) => (
        <a
          key={s.name}
          href={s.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-lg px-2 py-2 text-plexcrew-screen transition hover:bg-plexcrew-teal/10 hover:text-plexcrew-amber"
        >
          {s.iconUrl && (
            <img
              src={s.iconUrl}
              alt=""
              className="h-5 w-5 flex-none rounded"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          )}
          <span className="hidden truncate text-xs font-medium sm:inline">{s.name}</span>
        </a>
      ))}

      <div className="mt-auto border-t border-plexcrew-teal/15 pt-4 sm:mx-2">
        <Link
          href="/history"
          className="flex items-center gap-2 rounded-lg px-2 py-2 text-plexcrew-screen transition hover:bg-plexcrew-teal/10 hover:text-plexcrew-amber"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5 flex-none">
            <path d="M12 8v4l3 3" />
            <circle cx="12" cy="12" r="9" />
          </svg>
          <span className="hidden truncate text-xs font-medium sm:inline">Historique</span>
        </Link>
        {filesEnabled && (
          <Link
            href="/files"
            className="flex items-center gap-2 rounded-lg px-2 py-2 text-plexcrew-screen transition hover:bg-plexcrew-teal/10 hover:text-plexcrew-amber"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5 flex-none">
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
            </svg>
            <span className="hidden truncate text-xs font-medium sm:inline">Fichiers</span>
          </Link>
        )}
      </div>
    </aside>
  );
}
