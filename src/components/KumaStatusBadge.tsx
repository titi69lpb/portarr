import type { KumaStatus } from '@/lib/kuma';

// Deliberately minimal by explicit request: "all up" or "N down", nothing
// more — no monitor names, no per-service breakdown, no link to Kuma itself.
export function KumaStatusBadge({ status }: { status: KumaStatus | null }) {
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
      {allUp ? 'Tous les services opérationnels' : `${status.down} service${status.down > 1 ? 's' : ''} indisponible${status.down > 1 ? 's' : ''}`}
    </span>
  );
}
