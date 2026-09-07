'use client';

import { useEffect, useState } from 'react';

export function NewsletterSubscriptionToggle() {
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/newsletter/subscription')
      .then((res) => (res.ok ? res.json() : { subscribed: true }))
      .then((body) => {
        if (!cancelled) setSubscribed(body.subscribed ?? true);
      })
      .catch(() => {
        if (!cancelled) setSubscribed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle() {
    if (subscribed === null) return;
    setBusy(true);
    const next = !subscribed;
    try {
      const res = await fetch('/api/newsletter/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscribed: next }),
      });
      if (res.ok) setSubscribed(next);
    } finally {
      setBusy(false);
    }
  }

  if (subscribed === null) return null;

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className="rounded text-sm font-medium text-plexcrew-ash transition-colors hover:text-plexcrew-screen disabled:opacity-50"
      title={subscribed ? 'Se désabonner de la newsletter' : "S'abonner à la newsletter"}
    >
      {subscribed ? 'Newsletter : abonné' : 'Newsletter : désabonné'}
    </button>
  );
}
