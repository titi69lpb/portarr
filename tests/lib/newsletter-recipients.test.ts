import { describe, it, expect } from 'vitest';
import { pickNewsletterRecipients, type NewsletterRow } from '../../src/lib/newsletter-recipients';

const row = (provider: 'plex' | 'jellyfin', external_id: string, email: string, username = external_id): NewsletterRow => ({
  provider,
  external_id,
  email,
  username,
});

const all = () => true;

describe('pickNewsletterRecipients', () => {
  it('mails a shared address once when every member using it is subscribed, with the first row', () => {
    const rows = [row('plex', '1', 'a@example.com', 'a-plex'), row('jellyfin', 'j1', 'a@example.com', 'a-jf')];
    expect(pickNewsletterRecipients(rows, all)).toEqual([rows[0]]);
  });

  it('drops the address entirely when any member using it is unsubscribed (opt-out is sticky)', () => {
    const rows = [
      row('plex', '1', 'a@example.com'),
      row('jellyfin', 'j1', 'a@example.com'),
      row('plex', '2', 'b@example.com'),
    ];
    const result = pickNewsletterRecipients(rows, (r) => r.external_id !== 'j1');
    expect(result).toEqual([rows[2]]);
  });

  it('drops the address when the first row is the unsubscribed one', () => {
    const rows = [row('plex', '1', 'a@example.com'), row('jellyfin', 'j1', 'a@example.com')];
    expect(pickNewsletterRecipients(rows, (r) => r.external_id !== '1')).toEqual([]);
  });

  it('compares addresses case-insensitively and ignoring surrounding whitespace', () => {
    const rows = [row('plex', '1', 'Alice@Example.com'), row('jellyfin', 'j1', ' alice@example.com ')];
    expect(pickNewsletterRecipients(rows, all)).toEqual([rows[0]]);
  });

  it('leaves distinct addresses untouched', () => {
    const rows = [row('plex', '1', 'a@example.com'), row('plex', '2', 'b@example.com')];
    expect(pickNewsletterRecipients(rows, all)).toEqual(rows);
  });

  it('drops rows with an empty email', () => {
    const rows = [row('plex', '1', ''), row('plex', '2', '   '), row('plex', '3', 'c@example.com')];
    expect(pickNewsletterRecipients(rows, all)).toEqual([rows[2]]);
  });

  it('preserves input order', () => {
    const rows = [
      row('plex', '1', 'c@example.com'),
      row('plex', '2', 'a@example.com'),
      row('jellyfin', 'j1', 'c@example.com'),
      row('plex', '3', 'b@example.com'),
    ];
    expect(pickNewsletterRecipients(rows, all).map((r) => r.external_id)).toEqual(['1', '2', '3']);
  });
});
