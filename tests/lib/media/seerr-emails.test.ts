import { describe, it, expect, vi } from 'vitest';
import { fetchSeerrUsers, enrichMembersWithEmail, type SeerrUser } from '../../../src/lib/media/seerr-emails';
import type { MediaMember } from '../../../src/lib/media/types';

function res(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, statusText: status === 200 ? 'OK' : 'Error', json: async () => body } as unknown as Response;
}

function raw(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    email: `user${id}@example.com`,
    username: null,
    displayName: null,
    plexUsername: null,
    jellyfinUsername: null,
    jellyfinUserId: null,
    ...overrides,
  };
}

function seerr(id: number, overrides: Partial<SeerrUser> = {}): SeerrUser {
  return { id, email: `user${id}@example.com`, username: null, displayName: null, plexUsername: null, jellyfinUsername: null, jellyfinUserId: null, ...overrides };
}

const member = (userId: string, username: string, email = ''): MediaMember => ({ provider: 'jellyfin', userId, username, email });

describe('fetchSeerrUsers', () => {
  it('reads every page with the api key header and maps the fields', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(res({ pageInfo: { pages: 2, pageSize: 100, results: 101, page: 1 }, results: [raw(1, { displayName: 'Alice', plexUsername: 'Alice' })] }))
      .mockResolvedValueOnce(res({ pageInfo: { pages: 2, pageSize: 100, results: 101, page: 2 }, results: [raw(2)] })) as unknown as typeof fetch;
    const users = await fetchSeerrUsers('http://seerr.local:5055', 'seerr-key', fetchFn);
    expect(users.map((u) => u.id)).toEqual([1, 2]);
    expect(users[0]).toMatchObject({ displayName: 'Alice', plexUsername: 'Alice', jellyfinUserId: null });
    const calls = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0][0]).toBe('http://seerr.local:5055/api/v1/user?take=100&skip=0');
    expect(calls[1][0]).toBe('http://seerr.local:5055/api/v1/user?take=100&skip=100');
    expect(calls[0][1].headers['X-Api-Key']).toBe('seerr-key');
  });

  it('trims trailing slashes from the base url', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(res({ pageInfo: { pages: 1 }, results: [] })) as unknown as typeof fetch;
    await fetchSeerrUsers('http://seerr.local:5055/', 'k', fetchFn);
    const calls = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0][0]).toBe('http://seerr.local:5055/api/v1/user?take=100&skip=0');
  });

  it('throws with the status when Seerr answers non-ok', async () => {
    const fetchFn = vi.fn().mockResolvedValue(res({}, 403)) as unknown as typeof fetch;
    await expect(fetchSeerrUsers('http://seerr.local:5055', 'k', fetchFn)).rejects.toThrow('403');
  });
});

describe('enrichMembersWithEmail', () => {
  it('matches by jellyfin user id (dashes and case ignored)', () => {
    const result = enrichMembersWithEmail(
      [member('1a2b3c4d5e6f47a8b9c0d1e2f3a4b5c6', 'whatever')],
      [seerr(1, { jellyfinUserId: '1A2B3C4D-5E6F-47A8-B9C0-D1E2F3A4B5C6', email: 'id@example.com' })]
    );
    expect(result[0].email).toBe('id@example.com');
  });

  it('falls back to the name, case-insensitively, across jellyfinUsername / username / displayName / plexUsername', () => {
    for (const field of ['jellyfinUsername', 'username', 'displayName', 'plexUsername'] as const) {
      const user: SeerrUser = { ...seerr(1, { email: 'name@example.com' }) };
      user[field] = 'Alice';
      const result = enrichMembersWithEmail([member('a'.repeat(32), 'alice')], [user]);
      expect(result[0].email, field).toBe('name@example.com');
    }
  });

  it('prefers the id match over a name match', () => {
    const result = enrichMembersWithEmail(
      [member('a'.repeat(32), 'alice')],
      [seerr(1, { displayName: 'alice', email: 'byname@example.com' }), seerr(2, { jellyfinUserId: 'a'.repeat(32), email: 'byid@example.com' })]
    );
    expect(result[0].email).toBe('byid@example.com');
  });

  it('leaves the email empty when two different Seerr users match the same name', () => {
    const result = enrichMembersWithEmail(
      [member('a'.repeat(32), 'sam')],
      [seerr(1, { displayName: 'Sam' }), seerr(2, { plexUsername: 'sam' })]
    );
    expect(result[0].email).toBe('');
  });

  it('counts one Seerr user once even when several of its fields match', () => {
    const result = enrichMembersWithEmail(
      [member('a'.repeat(32), 'sam')],
      [seerr(1, { username: 'Sam', displayName: 'Sam', plexUsername: 'sam', email: 'sam@example.com' })]
    );
    expect(result[0].email).toBe('sam@example.com');
  });

  it('leaves the email empty when nothing matches or the match has no email', () => {
    expect(enrichMembersWithEmail([member('a'.repeat(32), 'nobody')], [seerr(1, { displayName: 'someone' })])[0].email).toBe('');
    expect(enrichMembersWithEmail([member('a'.repeat(32), 'sam')], [seerr(1, { displayName: 'sam', email: '' })])[0].email).toBe('');
  });

  it('never overwrites an existing email and never touches plex members', () => {
    const jellyfinWithEmail = member('a'.repeat(32), 'sam', 'kept@example.com');
    const plexMember: MediaMember = { provider: 'plex', userId: '1', username: 'sam', email: '' };
    const result = enrichMembersWithEmail([jellyfinWithEmail, plexMember], [seerr(1, { displayName: 'sam', email: 'other@example.com' })]);
    expect(result[0].email).toBe('kept@example.com');
    expect(result[1].email).toBe('');
  });
});
