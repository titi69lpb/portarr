import { describe, it, expect, vi } from 'vitest';
import { t } from '../../../src/lib/i18n/translate';

describe('t', () => {
  it('returns the localized string', () => {
    expect(t('fr', 'common.close')).toBe('Fermer');
    expect(t('en', 'common.close')).toBe('Close');
  });

  it('interpolates variables', () => {
    expect(t('en', 'common.pageOf', { page: 2, total: 5 })).toBe('Page 2 of 5');
  });

  it('falls back to FR when the EN key is missing', async () => {
    const { dictionaries } = await import('../../../src/lib/i18n/dictionaries');
    (dictionaries.fr.common as Record<string, string>).onlyFr = 'Seulement FR';
    expect(t('en', 'common.onlyFr')).toBe('Seulement FR');
    delete (dictionaries.fr.common as Record<string, string>).onlyFr;
  });

  it('returns the key when missing everywhere', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(t('fr', 'nope.missing')).toBe('nope.missing');
    spy.mockRestore();
  });
});
