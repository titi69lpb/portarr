'use client';

import { useState } from 'react';

export function AdminMemberSync() {
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
        setError('Échec de la synchronisation des utilisateurs Plex.');
        return;
      }
      const body = await res.json();
      setMessage(
        `${body.added} ajouté(s), ${body.updated} mis à jour, ${body.skippedNoEmail} sans email ignoré(s).`
      );
      window.location.reload();
    } catch {
      setError('Échec de la synchronisation des utilisateurs Plex.');
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
        {busy ? 'Synchronisation…' : 'Synchroniser depuis Plex'}
      </button>
      {message && <p className="text-sm text-plexcrew-screen">{message}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
