import { describe, it, expect } from 'vitest';
import { fr } from '../../../src/lib/i18n/dictionaries/fr';
import { en } from '../../../src/lib/i18n/dictionaries/en';

function leaves(obj: unknown, prefix = ''): string[] {
  if (typeof obj === 'string') return [prefix];
  if (!obj || typeof obj !== 'object') return [];
  return Object.entries(obj).flatMap(([k, v]) => leaves(v, prefix ? `${prefix}.${k}` : k));
}

describe('dictionary parity', () => {
  it('fr and en have identical leaf keys', () => {
    const f = new Set(leaves(fr));
    const e = new Set(leaves(en));
    const missingInEn = [...f].filter((k) => !e.has(k));
    const missingInFr = [...e].filter((k) => !f.has(k));
    expect({ missingInEn, missingInFr }).toEqual({ missingInEn: [], missingInFr: [] });
  });
});
