import { describe, it, expect } from 'vitest';
import { providerLabel } from '../../../src/lib/media/labels';

describe('providerLabel', () => {
  it('names each provider for the admin badge', () => {
    expect(providerLabel('plex')).toBe('Plex');
    expect(providerLabel('jellyfin')).toBe('Jellyfin');
  });
});
