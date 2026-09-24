'use client';

import { useState } from 'react';
import type { Announcement } from '@/lib/announcements';
import type { Locale } from '@/lib/i18n/dictionaries';
import { t } from '@/lib/i18n/translate';

export function AdminAnnouncementList({
  announcements,
  locale,
}: {
  announcements: Announcement[];
  locale: Locale;
}) {
  const [error, setError] = useState<string | null>(null);

  async function activate(id: number) {
    try {
      const res = await fetch(`/api/admin/announcements/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: true }),
      });
      if (!res.ok) {
        setError(t(locale, 'admin.activateAnnouncementError'));
        return;
      }
      window.location.reload();
    } catch {
      setError(t(locale, 'admin.activateAnnouncementError'));
    }
  }

  async function deactivate(id: number) {
    try {
      const res = await fetch(`/api/admin/announcements/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: false }),
      });
      if (!res.ok) {
        setError(t(locale, 'admin.deactivateAnnouncementError'));
        return;
      }
      window.location.reload();
    } catch {
      setError(t(locale, 'admin.deactivateAnnouncementError'));
    }
  }

  async function remove(id: number) {
    try {
      const res = await fetch(`/api/admin/announcements/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        setError(t(locale, 'admin.deleteAnnouncementError'));
        return;
      }
      window.location.reload();
    } catch {
      setError(t(locale, 'admin.deleteAnnouncementError'));
    }
  }

  if (announcements.length === 0) {
    return <p className="text-sm text-plexcrew-ash">{t(locale, 'admin.noAnnouncementsYet')}</p>;
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-400">{error}</p>}
      <ul className="space-y-2">
        {announcements.map((a) => (
          <li
            key={a.id}
            className={`pc-glass-surface flex flex-col gap-3 rounded-lg p-4 text-sm ring-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4 ${
              a.active ? 'ring-plexcrew-amber/50' : 'ring-plexcrew-teal/20'
            }`}
          >
            <span className="flex min-w-0 flex-1 items-center gap-2">
              {a.active && (
                <>
                  {/* One lit bulb — the marquee motif, turned down for the workspace. */}
                  <span className="pc-bulb-sm" aria-hidden="true" />
                  <span className="flex-none text-xs font-semibold uppercase tracking-wider text-plexcrew-amber">
                    {t(locale, 'admin.active')}
                  </span>
                </>
              )}
              <span className="min-w-0 truncate font-mono text-xs text-plexcrew-screen">
                {a.contentMarkdown}
              </span>
            </span>
            <span className="flex flex-none gap-4">
              {!a.active && (
                <button
                  onClick={() => activate(a.id)}
                  className="rounded font-medium text-plexcrew-ash transition-colors hover:text-plexcrew-screen"
                >
                  {t(locale, 'admin.activate')}
                </button>
              )}
              {a.active && (
                <button
                  onClick={() => deactivate(a.id)}
                  className="rounded font-medium text-plexcrew-ash transition-colors hover:text-plexcrew-screen"
                >
                  {t(locale, 'admin.deactivate')}
                </button>
              )}
              <button
                onClick={() => {
                  if (window.confirm(t(locale, 'admin.confirmDeleteAnnouncement'))) {
                    remove(a.id);
                  }
                }}
                className="rounded font-medium text-red-400 transition-colors hover:text-red-300"
              >
                {t(locale, 'admin.delete')}
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
