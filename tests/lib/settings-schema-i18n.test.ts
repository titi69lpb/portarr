import { describe, it, expect } from 'vitest';
import { SERVICE_FIELDS, fieldLabel, optionLabel } from '../../src/lib/settings-schema';
import { dictionaries } from '../../src/lib/i18n/dictionaries';
import { resolveStepError } from '../../src/lib/settings-error';
import { testPlexConnection } from '../../src/lib/connection-test';

function lookup(locale: 'fr' | 'en', key: string): unknown {
  return key.split('.').reduce<unknown>((acc, p) => (acc as Record<string, unknown> | undefined)?.[p], dictionaries[locale]);
}

const allDefs = Object.values(SERVICE_FIELDS).flat();

describe('settings-schema i18n keys', () => {
  it.each(['fr', 'en'] as const)('every field and option label key exists in %s', (locale) => {
    for (const def of allDefs) {
      expect(typeof lookup(locale, def.label), `${locale}:${def.label}`).toBe('string');
      for (const opt of def.options ?? []) {
        expect(typeof lookup(locale, opt.label), `${locale}:${opt.label}`).toBe('string');
      }
    }
  });

  it('fieldLabel and optionLabel resolve per locale', () => {
    const def = SERVICE_FIELDS.plex[0];
    expect(fieldLabel('en', def)).toBe('Plex server URL');
    expect(fieldLabel('fr', def)).toBe('URL du serveur Plex');
    const opt = SERVICE_FIELDS.jellyfinActivitySource[0].options![0];
    expect(optionLabel('en', opt)).toContain('Native');
  });
});

describe('resolveStepError', () => {
  it('translates a keyed status error', async () => {
    const res = { ok: false, status: 401, statusText: 'Unauthorized' } as Response;
    const r = await testPlexConnection('http://x', 't', (async () => res) as unknown as typeof fetch);
    expect(r.errorKey).toBe('settings.errors.serviceStatus');
    expect(resolveStepError('en', r as never)).toBe('Plex responded 401 Unauthorized');
    expect(resolveStepError('fr', r as never)).toBe('Plex a répondu 401 Unauthorized');
  });

  it('translates the field label of a required error', () => {
    const out = resolveStepError('en', {
      errorKey: 'settings.errors.fieldRequired',
      errorVars: { labelKey: 'settings.fields.PLEX_URL' },
    });
    expect(out).toBe('Plex server URL is required');
  });

  it('passes raw messages through', () => {
    expect(resolveStepError('en', { error: 'ECONNREFUSED' })).toBe('ECONNREFUSED');
  });
});
