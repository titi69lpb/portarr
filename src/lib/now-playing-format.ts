import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n/dictionaries';
import { t } from '@/lib/i18n/translate';

export function formatTimeLeft(
  viewOffsetMs: number,
  durationMs: number,
  locale: Locale = DEFAULT_LOCALE
): string {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return t(locale, 'nowPlaying.durationUnknown');
  }
  const remainingMinutes = Math.max(0, Math.round((durationMs - viewOffsetMs) / 60000));
  const hours = Math.floor(remainingMinutes / 60);
  const minutes = remainingMinutes % 60;
  return hours > 0
    ? t(locale, 'nowPlaying.timeLeftHoursMinutes', { hours, minutes })
    : t(locale, 'nowPlaying.timeLeftMinutes', { minutes });
}

export function calculateProgress(viewOffsetMs: number, durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(0, (viewOffsetMs / durationMs) * 100));
}
