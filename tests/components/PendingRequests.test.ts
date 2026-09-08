import { describe, it, expect } from 'vitest';
import { requestedAgoLabel } from '../../src/components/PendingRequests';

// PendingRequests itself renders JSX (no jsdom in this repo's test setup —
// same convention as RecentlyAdded/login/HistoryLoadMore), so only the pure
// date-formatting helper backing the hover overlay is unit-tested here.

describe('requestedAgoLabel', () => {
  const now = new Date('2026-09-08T12:00:00.000Z').getTime();

  it("labels a request made today as Aujourd'hui", () => {
    expect(requestedAgoLabel('2026-09-08T09:00:00.000Z', now)).toBe("Aujourd'hui");
  });

  it('labels a request made yesterday as Hier', () => {
    expect(requestedAgoLabel('2026-09-07T09:00:00.000Z', now)).toBe('Hier');
  });

  it('labels a request a few days old in days', () => {
    expect(requestedAgoLabel('2026-09-03T09:00:00.000Z', now)).toBe('Il y a 5 j');
  });

  it('labels a request older than a month in months', () => {
    expect(requestedAgoLabel('2026-06-01T09:00:00.000Z', now)).toBe('Il y a 3 mois');
  });
});
