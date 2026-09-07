'use client';

import { useState } from 'react';

export function AdminNewsletterPanel() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function sendNow() {
    if (!window.confirm('Envoyer la newsletter maintenant à tous les abonnés ?')) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/newsletter/send', { method: 'POST' });
      if (!res.ok) {
        setError("Echec de l'envoi de la newsletter");
        return;
      }
      const body = await res.json();
      if (body.skipped) {
        setMessage('Aucun nouvel ajout dans la fenêtre — rien envoyé.');
      } else {
        setMessage(`Envoyée à ${body.sent}/${body.total} destinataires.`);
      }
    } catch {
      setError("Echec de l'envoi de la newsletter");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        onClick={sendNow}
        disabled={busy}
        className="rounded-md bg-plexcrew-amber px-4 py-2 text-sm font-semibold text-plexcrew-ink transition-colors hover:bg-plexcrew-amber/90 disabled:opacity-50"
      >
        Envoyer maintenant
      </button>
      {message && <p className="text-sm text-plexcrew-screen">{message}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
