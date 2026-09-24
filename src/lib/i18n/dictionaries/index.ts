import { fr } from './fr';
import { en } from './en';

export type Locale = 'fr' | 'en';
export const LOCALES: Locale[] = ['fr', 'en'];
export const DEFAULT_LOCALE: Locale = 'fr';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as string[]).includes(value);
}

export const dictionaries: Record<Locale, typeof fr> = { fr, en };
