import type { CalendarItem } from './calendar';

export interface DayEntry {
  key: string;
  kind: 'movie' | 'episode';
  title: string;
  available: boolean;
  seasonNumber: number | null;
  episodeCount: number;
}

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function groupDayItems(dayItems: CalendarItem[]): DayEntry[] {
  const movies: DayEntry[] = dayItems
    .filter((item) => item.kind === 'movie')
    .map((item) => ({
      key: item.title + item.releaseDate,
      kind: 'movie' as const,
      title: item.title,
      available: item.available,
      seasonNumber: null,
      episodeCount: 1,
    }));

  const episodesByShow = new Map<string, CalendarItem[]>();
  for (const item of dayItems.filter((item) => item.kind === 'episode')) {
    const groupKey = `${item.title}::${item.seasonNumber}`;
    const group = episodesByShow.get(groupKey) ?? [];
    group.push(item);
    episodesByShow.set(groupKey, group);
  }

  const episodes: DayEntry[] = Array.from(episodesByShow.values()).map((group) => ({
    key: group[0].title + group[0].seasonNumber + group[0].releaseDate,
    kind: 'episode' as const,
    title: group[0].title,
    available: group.every((item) => item.available),
    seasonNumber: group[0].seasonNumber,
    episodeCount: group.length,
  }));

  return [...movies, ...episodes];
}

// Builds the whole month's day->entries mapping in a single pass over `items`
// instead of re-filtering and re-parsing every item's date once per grid cell
// (a 42-cell month grid previously did that 42 times per render/navigation).
export function buildDayEntryMap(items: CalendarItem[]): Map<string, DayEntry[]> {
  const byDay = new Map<string, CalendarItem[]>();
  for (const item of items) {
    const key = dayKey(new Date(item.releaseDate));
    const list = byDay.get(key) ?? [];
    list.push(item);
    byDay.set(key, list);
  }

  const result = new Map<string, DayEntry[]>();
  for (const [key, dayItems] of byDay) {
    result.set(key, groupDayItems(dayItems));
  }
  return result;
}
