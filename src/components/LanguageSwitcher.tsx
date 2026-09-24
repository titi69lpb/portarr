'use client';

import { useState } from 'react';
import type { Locale } from '@/lib/i18n/dictionaries';
import { t } from '@/lib/i18n/translate';

export function LanguageSwitcher({
  locale,
  hasPersonalOverride = false,
}: {
  locale: Locale;
  /** Show a "follow instance default" reset — only meaningful when this
   * user actually has a personal override saved (see getUserPersonalLocale),
   * otherwise there's nothing to reset. */
  hasPersonalOverride?: boolean;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function switchTo(next: Locale | null) {
    if (submitting || (next !== null && next === locale)) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/user/locale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale: next }),
      });
      if (!res.ok) {
        setError(t(locale, 'languageSwitcher.updateError'));
        return;
      }
      window.location.reload();
    } catch {
      setError(t(locale, 'languageSwitcher.updateError'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex items-center gap-1 text-sm">
      <button
        type="button"
        onClick={() => switchTo('fr')}
        disabled={submitting}
        className={
          locale === 'fr'
            ? 'font-semibold text-plexcrew-screen'
            : 'text-plexcrew-ash transition-colors hover:text-plexcrew-screen'
        }
      >
        FR
      </button>
      <span className="text-plexcrew-ash">/</span>
      <button
        type="button"
        onClick={() => switchTo('en')}
        disabled={submitting}
        className={
          locale === 'en'
            ? 'font-semibold text-plexcrew-screen'
            : 'text-plexcrew-ash transition-colors hover:text-plexcrew-screen'
        }
      >
        EN
      </button>
      {hasPersonalOverride && (
        <button
          type="button"
          onClick={() => switchTo(null)}
          disabled={submitting}
          className="ml-2 text-xs text-plexcrew-ash underline transition-colors hover:text-plexcrew-screen"
        >
          {t(locale, 'languageSwitcher.followDefault')}
        </button>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
