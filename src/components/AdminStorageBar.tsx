import type { VolumeStats } from '@/lib/storage';

function formatGo(bytes: number): string {
  return Math.round(bytes / 1024 ** 3).toLocaleString('fr-FR');
}

function DriveIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 flex-none text-plexcrew-teal" aria-hidden="true">
      <rect x="2" y="6" width="20" height="12" rx="2" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.5" />
      <line x1="2" y1="14" x2="22" y2="14" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="18" cy="16" r="1" fill="currentColor" />
    </svg>
  );
}

// Windows Explorer's drive bar — icon, label, a used/free progress bar, and
// "X Go libres sur Y Go" — is a genuinely good, instantly-familiar format for
// this exact information, so this deliberately mirrors it rather than
// inventing a new one.
export function DriveBar({
  name,
  totalBytes,
  freeBytes,
  emphasized = false,
}: VolumeStats & { emphasized?: boolean }) {
  const usedBytes = Math.max(0, totalBytes - freeBytes);
  const usedPercent = totalBytes > 0 ? Math.min(100, (usedBytes / totalBytes) * 100) : 0;
  const isLow = totalBytes > 0 && freeBytes / totalBytes < 0.1;

  return (
    <div
      className={`pc-glass-surface rounded-lg ring-1 ring-plexcrew-teal/20 ${
        emphasized ? 'p-5' : 'p-3'
      }`}
    >
      <div className="flex items-center gap-2.5">
        <DriveIcon />
        <span className={`font-medium text-plexcrew-screen ${emphasized ? 'text-base' : 'text-sm'}`}>
          {name}
        </span>
      </div>
      <div className={`${emphasized ? 'mt-3 h-2.5' : 'mt-2 h-1.5'} w-full overflow-hidden rounded-full bg-plexcrew-ink`}>
        <div
          className={`h-full rounded-full ${isLow ? 'bg-plexcrew-amber' : 'bg-plexcrew-teal'}`}
          style={{ width: `${usedPercent}%` }}
        />
      </div>
      <p className={`mt-1.5 text-plexcrew-ash ${emphasized ? 'text-sm' : 'text-xs'}`}>
        {totalBytes > 0 ? (
          <>
            {formatGo(freeBytes)} Go libres sur {formatGo(totalBytes)} Go
          </>
        ) : (
          'Indisponible'
        )}
      </p>
    </div>
  );
}

export function AdminStorageBars({
  combined,
  volumes,
}: {
  combined: VolumeStats;
  volumes: VolumeStats[];
}) {
  return (
    <div className="space-y-3">
      <DriveBar {...combined} name="Bibliothèques (Cube-SYNO + TFS-SYNO)" emphasized />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {volumes.map((v) => (
          <DriveBar key={v.name} {...v} />
        ))}
      </div>
    </div>
  );
}
