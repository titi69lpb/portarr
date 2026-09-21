import type { ProviderId } from './media/types';

export interface NewsletterRow {
  provider: ProviderId;
  external_id: string;
  email: string;
  username: string;
}

// The same person can be a Plex and a Jellyfin member sharing one address.
// An address is mailed ONCE, and only when EVERY member using it is
// subscribed, so an opt-out stays sticky; the first row (input order) carries
// the unsubscribe token. Rows without an email are dropped.
export function pickNewsletterRecipients(
  rows: NewsletterRow[],
  isSubscribed: (row: NewsletterRow) => boolean
): NewsletterRow[] {
  const groups = new Map<string, NewsletterRow[]>();
  for (const row of rows) {
    const key = row.email.trim().toLowerCase();
    if (!key) continue;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  const picked: NewsletterRow[] = [];
  for (const group of groups.values()) {
    if (group.every(isSubscribed)) picked.push(group[0]);
  }
  return picked;
}
