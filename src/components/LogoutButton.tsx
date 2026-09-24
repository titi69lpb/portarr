'use client';

import type { Locale } from '@/lib/i18n/dictionaries';
import { t } from '@/lib/i18n/translate';

export function LogoutButton({ locale }: { locale: Locale }) {
  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }
  return (
    <button
      onClick={handleLogout}
      className="rounded text-sm font-medium text-plexcrew-ash transition-colors hover:text-plexcrew-screen"
    >
      {t(locale, 'dashboard.logout')}
    </button>
  );
}
