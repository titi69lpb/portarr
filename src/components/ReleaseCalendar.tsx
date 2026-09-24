'use client';

import { useMemo, useState } from 'react';
import type { CalendarItem } from '@/lib/calendar';
import { buildDayEntryMap, dayKey } from '@/lib/calendar-grouping';
import { dictionaries, type Locale } from '@/lib/i18n/dictionaries';
import { t } from '@/lib/i18n/translate';

function startOfMonthGrid(year: number, month: number): Date {
  const firstOfMonth = new Date(year, month, 1);
  const weekday = (firstOfMonth.getDay() + 6) % 7; // 0 = Monday
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(firstOfMonth.getDate() - weekday);
  return gridStart;
}

export function ReleaseCalendar({ items, locale }: { items: CalendarItem[]; locale: Locale }) {
  const weekdayLabels = dictionaries[locale].calendar.weekdayLabels;
  const localeCode = dictionaries[locale].calendar.localeCode;
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const dayEntryMap = useMemo(() => buildDayEntryMap(items), [items]);

  const gridStart = startOfMonthGrid(viewYear, viewMonth);
  const days: Date[] = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });

  function goToPreviousMonth() {
    const prev = new Date(viewYear, viewMonth - 1, 1);
    setViewYear(prev.getFullYear());
    setViewMonth(prev.getMonth());
  }

  function goToNextMonth() {
    const next = new Date(viewYear, viewMonth + 1, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  }

  return (
    <section>
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="h-6 w-1.5 flex-none rounded-full bg-plexcrew-teal" />
        <h2 className="pc-eyebrow">{t(locale, 'calendar.title')}</h2>
      </div>
      <div className="pc-rule" />
      <div className="mt-5 flex items-center justify-between">
        <button
          onClick={goToPreviousMonth}
          aria-label={t(locale, 'calendar.prevMonth')}
          className="rounded px-2 py-1 text-plexcrew-ash hover:text-plexcrew-screen"
        >
          ←
        </button>
        <span className="font-display text-sm uppercase tracking-widest text-plexcrew-screen">
          {new Date(viewYear, viewMonth, 1).toLocaleDateString(localeCode, { month: 'long', year: 'numeric' })}
        </span>
        <button
          onClick={goToNextMonth}
          aria-label={t(locale, 'calendar.nextMonth')}
          className="rounded px-2 py-1 text-plexcrew-ash hover:text-plexcrew-screen"
        >
          →
        </button>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-wider text-plexcrew-ash">
        {weekdayLabels.map((label) => (
          <div key={label}>{label}</div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {days.map((day) => {
          const inCurrentMonth = day.getMonth() === viewMonth;
          const isToday = day.toDateString() === today.toDateString();
          return (
            <div
              key={day.toISOString()}
              className={`min-h-[72px] rounded-lg border p-1.5 ${
                inCurrentMonth
                  ? 'border-plexcrew-teal/15 bg-plexcrew-charcoal/70'
                  : 'border-transparent bg-plexcrew-ink/40 opacity-40'
              } ${isToday ? 'border-plexcrew-amber/50 ring-1 ring-plexcrew-amber/30' : ''}`}
            >
              <div
                className={`text-right text-[11px] ${
                  isToday ? 'font-bold text-plexcrew-amber' : inCurrentMonth ? 'text-plexcrew-screen/70' : 'text-plexcrew-ash'
                }`}
              >
                {day.getDate()}
              </div>
              <div className="mt-1 space-y-1">
                {(dayEntryMap.get(dayKey(day)) ?? []).map((entry) => (
                  <div
                    key={entry.key}
                    className={`truncate rounded px-1 py-0.5 text-[10px] leading-tight ${
                      entry.available
                        ? 'bg-plexcrew-teal/15 text-plexcrew-screen'
                        : 'bg-plexcrew-amber/10 text-plexcrew-amber'
                    }`}
                    title={
                      entry.kind === 'episode' && entry.seasonNumber !== null && entry.episodeCount > 1
                        ? t(locale, 'calendar.seasonEpisodesTitle', {
                            title: entry.title,
                            season: entry.seasonNumber,
                            count: entry.episodeCount,
                          })
                        : entry.title
                    }
                  >
                    <span aria-hidden="true">{entry.kind === 'episode' ? '📺' : '🎬'}</span>{' '}
                    {entry.kind === 'episode' && entry.seasonNumber !== null
                      ? entry.episodeCount > 1
                        ? t(locale, 'calendar.seasonMultiEpisode', { season: entry.seasonNumber, count: entry.episodeCount })
                        : t(locale, 'calendar.seasonSingle', { season: entry.seasonNumber })
                      : ''}
                    {entry.title}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
