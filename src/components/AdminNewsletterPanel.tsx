'use client';

import { useState } from 'react';
import type { Locale } from '@/lib/i18n/dictionaries';
import { t } from '@/lib/i18n/translate';

export function AdminNewsletterPanel({ locale }: { locale: Locale }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function sendNow() {
    if (!window.confirm(t(locale, 'admin.newsletterSendConfirm'))) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/newsletter/send', { method: 'POST' });
      if (!res.ok) {
        setError(t(locale, 'admin.newsletterSendError'));
        return;
      }
      const body = await res.json();
      if (body.skipped) {
        setMessage(t(locale, 'admin.newsletterSkipped'));
      } else {
        setMessage(t(locale, 'admin.newsletterSent', { sent: body.sent, total: body.total }));
      }
    } catch {
      setError(t(locale, 'admin.newsletterSendError'));
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
        {t(locale, 'admin.newsletterSendNow')}
      </button>
      {message && <p className="text-sm text-plexcrew-screen">{message}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
