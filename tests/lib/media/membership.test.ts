import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isStillMember } from '../../../src/lib/media/membership';
import { resetTtlCacheForTests } from '../../../src/lib/ttl-cache';

beforeEach(() => {
  resetTtlCacheForTests();
});

const USERS_XML =
  '<MediaContainer><User id="5" email="a@b.com" username="al"><Server name="MyPlex"/></User></MediaContainer>';

function usersFetch(): typeof fetch {
  return vi.fn(async () => ({ ok: true, status: 200, text: async () => USERS_XML }) as Response) as unknown as typeof fetch;
}

const ENV = { PLEX_SERVER_TOKEN: 'tok', PLEX_SERVER_NAME: 'MyPlex' };

describe('isStillMember', () => {
  it('confirms a plex user who is still shared', async () => {
    expect(await isStillMember({ provider: 'plex', userId: '5' }, ENV, usersFetch())).toBe(true);
  });

  it('rejects a plex user whose share was revoked', async () => {
    expect(await isStillMember({ provider: 'plex', userId: '99' }, ENV, usersFetch())).toBe(false);
  });

  it('skips revalidation (allows) when plex is not configured through env', async () => {
    const fetchFn = usersFetch();
    expect(await isStillMember({ provider: 'plex', userId: '99' }, {}, fetchFn)).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('allows a jellyfin ref until the jellyfin adapter exists', async () => {
    expect(await isStillMember({ provider: 'jellyfin', userId: 'x' }, ENV, usersFetch())).toBe(true);
  });
});
