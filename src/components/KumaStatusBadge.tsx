import type { KumaStatus } from '@/lib/kuma';
import type { Locale } from '@/lib/i18n/dictionaries';
import { t } from '@/lib/i18n/translate';

// Deliberately minimal by explicit request: "all up" or "N down", nothing
// more — no monitor names, no per-service breakdown, no link to Kuma itself.
export function KumaStatusBadge({ status, locale }: { status: KumaStatus | null; locale: Locale }) {
  if (!status || status.total === 0) return null;
  const allUp = status.down === 0;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
        allUp ? 'bg-plexcrew-teal/15 text-plexcrew-teal' : 'bg-amber-500/15 text-amber-400'
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${allUp ? 'bg-plexcrew-teal' : 'bg-amber-400'}`}
      />
      {allUp
        ? t(locale, 'kuma.allUp')
        : status.down > 1
          ? t(locale, 'kuma.manyDown', { count: status.down })
          : t(locale, 'kuma.oneDown')}
    </span>
  );
}
