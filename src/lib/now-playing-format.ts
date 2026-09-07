export function formatTimeLeft(viewOffsetMs: number, durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return 'Durée inconnue';
  }
  const remainingMinutes = Math.max(0, Math.round((durationMs - viewOffsetMs) / 60000));
  const hours = Math.floor(remainingMinutes / 60);
  const minutes = remainingMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m restantes` : `${minutes}m restantes`;
}

export function calculateProgress(viewOffsetMs: number, durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(0, (viewOffsetMs / durationMs) * 100));
}
