import type { GlobalStat, StatCategory } from '@/lib/tautulli';
import { StatCard } from './StatCard';

const CARD_TITLES: Record<StatCategory, string> = {
  topMovies: 'Most Watched Movies',
  popularMovies: 'Most Popular Movies',
  topTv: 'Most Watched Shows',
  popularTv: 'Most Popular Shows',
  topLibraries: 'Most Active Libraries',
  topUsers: 'Most Active Users',
  topPlatforms: 'Most Active Platforms',
  mostConcurrent: 'Most Concurrent Streams',
};

// 'topPlatforms' and 'mostConcurrent' are deliberately excluded here per user
// feedback (not useful for a member-facing dashboard) — the data is still
// computed by getExtendedStats since other categories share that single fetch;
// simply not rendered.
const CARD_ORDER: StatCategory[] = [
  'topMovies',
  'popularMovies',
  'topTv',
  'popularTv',
  'topLibraries',
  'topUsers',
];

export function StatsGlobal({ extended }: { extended: Record<StatCategory, GlobalStat[]> }) {
  return (
    <section>
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="h-6 w-1.5 flex-none rounded-full bg-plexcrew-teal" />
        <h2 className="pc-eyebrow">Box Office</h2>
      </div>
      <div className="pc-rule" />
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CARD_ORDER.map((category) => (
          <StatCard key={category} title={CARD_TITLES[category]} items={extended[category]} />
        ))}
      </div>
    </section>
  );
}
