import { dictionaries, type Locale } from './dictionaries';

function getByPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object' && part in acc) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, obj);
}

export function t(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  let value = getByPath(dictionaries[locale], key);

  if (typeof value !== 'string' && locale !== 'fr') {
    value = getByPath(dictionaries.fr, key);
  }

  if (typeof value !== 'string') {
    console.error(`Missing i18n key: ${key}`);
    return key;
  }

  let result: string = value;

  if (vars) {
    for (const [name, replacement] of Object.entries(vars)) {
      result = result.replace(new RegExp(`{{${name}}}`, 'g'), String(replacement));
    }
  }

  return result;
}
