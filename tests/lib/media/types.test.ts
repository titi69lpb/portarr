import { describe, it, expect } from 'vitest';
import { isProviderId } from '../../../src/lib/media/types';

describe('isProviderId', () => {
  it('accepts the known providers', () => {
    expect(isProviderId('plex')).toBe(true);
    expect(isProviderId('jellyfin')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isProviderId('emby')).toBe(false);
    expect(isProviderId('')).toBe(false);
    expect(isProviderId(undefined)).toBe(false);
    expect(isProviderId(42)).toBe(false);
  });
});
