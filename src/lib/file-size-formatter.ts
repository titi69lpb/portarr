import { type Locale, DEFAULT_LOCALE } from './i18n/dictionaries';

const SIZE_UNITS: Record<Locale, string[]> = {
  en: ['B', 'KB', 'MB', 'GB', 'TB'],
  fr: ['o', 'Ko', 'Mo', 'Go', 'To'],
};

export function formatFileSize(bytes: number, locale: Locale = DEFAULT_LOCALE): string {
  const units = SIZE_UNITS[locale];
  if (bytes < 1024) return `${bytes} ${units[0]}`;

  let value = bytes / 1024;
  let unitIndex = 1;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(2)} ${units[unitIndex]}`;
}
