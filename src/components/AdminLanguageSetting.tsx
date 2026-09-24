'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Locale } from '@/lib/i18n/dictionaries';
import { t } from '@/lib/i18n/translate';

export function AdminLanguageSetting({
  currentDefault,
  locale,
  hasPersonalOverride = false,
}: {
  currentDefault: Locale;
  locale: Locale;
  /** The signed-in admin has a personal language: it wins over the instance
   * default, so changing the default looks like a no-op for them. Say so. */
  hasPersonalOverride?: boolean;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setDefault(next: Locale) {
    if (next === currentDefault || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/settings/locale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale: next }),
      });
      if (!res.ok) {
        setError(t(locale, 'admin.languageUpdateError'));
        return;
      }
      window.location.reload();
    } catch {
      setError(t(locale, 'admin.languageUpdateError'));
    } finally {
      setSubmitting(false);
    }
  }

  const btn = (l: Locale, label: string) => (
    <button
      type="button"
      onClick={() => setDefault(l)}
      disabled={submitting}
      className={
        currentDefault === l
          ? 'rounded bg-plexcrew-amber px-3 py-1.5 font-semibold text-plexcrew-ink'
          : 'rounded px-3 py-1.5 text-plexcrew-ash hover:text-plexcrew-screen'
      }
    >
      {label}
    </button>
  );

  return (
    <div className="pc-glass-surface space-y-3 rounded-lg p-5 ring-1 ring-plexcrew-teal/20">
      <p className="text-sm text-plexcrew-ash">{t(locale, 'admin.languageDescription')}</p>
      <div className="flex items-center gap-1 text-sm">
        {btn('fr', 'FR')}
        {btn('en', 'EN')}
      </div>
      {hasPersonalOverride && (
        <p className="text-xs text-plexcrew-amber">
          {t(locale, 'admin.languageOverrideHint', {
            language: t(locale, locale === 'fr' ? 'common.french' : 'common.english'),
          })}{' '}
          <Link href="/profile" className="underline">
            {t(locale, 'sidebar.profile')}
          </Link>
        </p>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
