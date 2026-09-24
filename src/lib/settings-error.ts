import type { Locale } from './i18n/dictionaries';
import { t } from './i18n/translate';

export interface StepErrorPayload {
  error?: string;
  errorKey?: string;
  errorVars?: Record<string, string | number>;
}

// Renders an error returned by the setup/settings step routes in the viewer's
// locale. Messages without a key (raw upstream/network errors) pass through.
export function resolveStepError(locale: Locale, data: StepErrorPayload): string {
  if (!data.errorKey) return data.error ?? t(locale, 'settings.errors.unknown');
  const vars: Record<string, string | number> = { ...(data.errorVars ?? {}) };
  if (typeof vars.labelKey === 'string') {
    vars.field = t(locale, vars.labelKey);
    delete vars.labelKey;
  }
  return t(locale, data.errorKey, vars);
}
