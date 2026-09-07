import { describe, it, expect } from 'vitest';
import { buildDayEntryMap, dayKey } from '../../src/lib/calendar-grouping';
import type { CalendarItem } from '../../src/lib/calendar';

function item(overrides: Partial<CalendarItem>): CalendarItem {
  return {
    title: 'Some Show',
    releaseDate: '2026-09-05T20:00:00.000Z',
    available: false,
    kind: 'episode',
    seasonNumber: 1,
    episodeNumber: 1,
    ...overrides,
  };
}

describe('buildDayEntryMap', () => {
  it('groups multiple episodes of the same show and season on the same day into one entry', () => {
    const items = [
      item({ episodeNumber: 1 }),
      item({ episodeNumber: 2 }),
      item({ episodeNumber: 3 }),
    ];
    const map = buildDayEntryMap(items);
    const day = new Date('2026-09-05T20:00:00.000Z');
    const entries = map.get(dayKey(day));
    expect(entries).toHaveLength(1);
    expect(entries?.[0].episodeCount).toBe(3);
    expect(entries?.[0].kind).toBe('episode');
  });

  it('keeps movies and episodes as separate entries on the same day', () => {
    const day = '2026-09-05T20:00:00.000Z';
    const items = [
      item({ kind: 'movie', title: 'A Movie', seasonNumber: null, releaseDate: day }),
      item({ kind: 'episode', title: 'A Show', releaseDate: day }),
    ];
    const map = buildDayEntryMap(items);
    const entries = map.get(dayKey(new Date(day)));
    expect(entries).toHaveLength(2);
  });

  it('separates items on different days into different map entries', () => {
    const items = [
      item({ releaseDate: '2026-09-05T20:00:00.000Z' }),
      item({ releaseDate: '2026-09-06T20:00:00.000Z' }),
    ];
    const map = buildDayEntryMap(items);
    expect(map.size).toBe(2);
  });

  it('marks a grouped episode entry unavailable if any episode in the group is unavailable', () => {
    const day = '2026-09-05T20:00:00.000Z';
    const items = [
      item({ episodeNumber: 1, available: true, releaseDate: day }),
      item({ episodeNumber: 2, available: false, releaseDate: day }),
    ];
    const map = buildDayEntryMap(items);
    const entries = map.get(dayKey(new Date(day)));
    expect(entries?.[0].available).toBe(false);
  });

  it('returns an empty map for an empty item list', () => {
    expect(buildDayEntryMap([]).size).toBe(0);
  });
});
