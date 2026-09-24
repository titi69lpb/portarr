import Link from 'next/link';
import type { PersonalStats, PersonalStatsByType, RecentHistoryItem } from '@/lib/activity/tautulli-source';
import type { Locale } from '@/lib/i18n/dictionaries';
import { t } from '@/lib/i18n/translate';

function RecentHistoryStrip({ items, locale }: { items: RecentHistoryItem[]; locale: Locale }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-6">
      <div className="flex items-baseline justify-between">
        <h4 className="text-xs uppercase tracking-wider text-plexcrew-ash">{t(locale, 'statsPersonal.recentlyWatched')}</h4>
        <Link href="/history" className="text-xs text-plexcrew-teal hover:underline">
          {t(locale, 'statsPersonal.seeAll')}
        </Link>
      </div>
      <div className="pc-scrollbar mt-3 flex gap-3 overflow-x-auto pb-1">
        {items.map((item, i) => (
          <div key={`${item.thumbPath}-${i}`} className="w-[92px] flex-none">
            <img
              src={`/api/newsletter/poster?path=${encodeURIComponent(item.thumbPath)}`}
              alt={item.title}
              className="aspect-[2/3] w-full rounded-md object-cover ring-1 ring-plexcrew-teal/20"
            />
            <p className="mt-1.5 truncate text-[11px] text-plexcrew-screen/80">{item.title}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StatsPersonal({
  stats,
  byType,
  recentHistory = [],
  locale,
}: {
  stats: PersonalStats | null;
  byType: PersonalStatsByType | null;
  recentHistory?: RecentHistoryItem[];
  locale: Locale;
}) {
  if (!stats) {
    return <p className="text-sm text-plexcrew-ash">{t(locale, 'statsPersonal.empty')}</p>;
  }
  const hours = Math.round(stats.totalDurationSeconds / 3600);
  return (
    <section>
      <h3 className="pc-eyebrow">{t(locale, 'statsPersonal.title')}</h3>
      <div className="pc-rule" />
      <dl className={`mt-5 grid grid-cols-2 gap-4 ${byType ? 'sm:grid-cols-4' : ''}`}>
        <div className="pc-glass-surface rounded-lg p-5 ring-1 ring-plexcrew-teal/15">
          <dd className="font-mono text-3xl font-medium leading-none text-plexcrew-screen">
            {stats.plays}
          </dd>
          <dt className="mt-2 text-xs uppercase tracking-wider text-plexcrew-ash">{t(locale, 'statsPersonal.plays')}</dt>
        </div>
        <div className="pc-glass-surface rounded-lg p-5 ring-1 ring-plexcrew-teal/15">
          <dd className="font-mono text-3xl font-medium leading-none text-plexcrew-screen">
            {hours}
            <span className="text-plexcrew-ash">h</span>
          </dd>
          <dt className="mt-2 text-xs uppercase tracking-wider text-plexcrew-ash">{t(locale, 'statsPersonal.watchTime')}</dt>
        </div>
        {byType && (
          <>
            <div className="pc-glass-surface rounded-lg p-5 ring-1 ring-plexcrew-teal/15">
              <dd className="font-mono text-3xl font-medium leading-none text-plexcrew-screen">
                {byType.movies.count}
              </dd>
              <dt className="mt-2 text-xs uppercase tracking-wider text-plexcrew-ash">
                {t(locale, 'statsPersonal.movies')} — {Math.round(byType.movies.hours)}h
              </dt>
            </div>
            <div className="pc-glass-surface rounded-lg p-5 ring-1 ring-plexcrew-teal/15">
              <dd className="font-mono text-3xl font-medium leading-none text-plexcrew-screen">
                {byType.episodes.count}
              </dd>
              <dt className="mt-2 text-xs uppercase tracking-wider text-plexcrew-ash">
                {t(locale, 'statsPersonal.episodes')} — {Math.round(byType.episodes.hours)}h
              </dt>
            </div>
          </>
        )}
      </dl>
      <RecentHistoryStrip items={recentHistory} locale={locale} />
    </section>
  );
}
