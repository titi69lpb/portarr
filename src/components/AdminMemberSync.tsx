'use client';

import { useState } from 'react';
import type { Locale } from '@/lib/i18n/dictionaries';
import { t } from '@/lib/i18n/translate';

export function AdminMemberSync({ locale }: { locale: Locale }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function sync() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/members/sync', { method: 'POST' });
      if (!res.ok) {
        setError(t(locale, 'admin.syncError'));
        return;
      }
      const body = await res.json();
      setMessage(
        t(locale, 'admin.syncResult', {
          added: body.added,
          updated: body.updated,
          skipped: body.skippedNoEmail,
        })
      );
      window.location.reload();
    } catch {
      setError(t(locale, 'admin.syncError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        onClick={sync}
        disabled={busy}
        className="rounded-md border border-plexcrew-teal/30 px-4 py-2 text-sm font-medium text-plexcrew-screen transition-colors hover:border-plexcrew-teal disabled:opacity-50"
      >
        {busy ? t(locale, 'admin.syncing') : t(locale, 'admin.syncFromPlex')}
      </button>
      {message && <p className="text-sm text-plexcrew-screen">{message}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
