import type { GlobalStat } from '@/lib/tautulli';

const RANK_COLORS = ['text-plexcrew-amber', 'text-plexcrew-screen', 'text-plexcrew-ash'];

// Podium treatment for rank #1 only (not a full 3-slot podium layout — most
// categories here are ranked *titles* (movies/shows), which don't read well
// side-by-side the way ranked *people* do on a leaderboard). Keeping the list
// layout for #2/#3 but giving #1 a visibly heavier row reads as "the winner"
// across every category, including ones with only 1-2 items.
function StatRow({ item, rank }: { item: GlobalStat; rank: number }) {
  const isFirst = rank === 0;
  return (
    <li
      className={`flex items-center gap-3 rounded-lg ${
        isFirst
          ? 'border border-plexcrew-amber/30 bg-plexcrew-amber/10 px-2 py-1.5 shadow-[0_0_16px_-4px_var(--tw-shadow-color)] shadow-plexcrew-amber/40'
          : 'px-2 py-1'
      }`}
    >
      <span
        className={`flex-none font-mono ${isFirst ? 'text-base' : 'w-5 text-xs'} ${
          RANK_COLORS[rank] ?? 'text-plexcrew-ash'
        }`}
      >
        {isFirst ? '🏆' : String(rank + 1).padStart(2, '0')}
      </span>
      {item.posterPath && (
        <img
          src={`/api/newsletter/poster?path=${encodeURIComponent(item.posterPath)}`}
          alt=""
          className={`flex-none rounded object-cover ring-1 ${
            isFirst ? 'h-12 w-8 ring-plexcrew-amber/40' : 'h-9 w-6 ring-plexcrew-teal/20'
          }`}
        />
      )}
      <span
        className={`min-w-0 flex-1 truncate text-plexcrew-screen ${isFirst ? 'text-base font-bold' : 'text-sm'}`}
      >
        {item.title}
      </span>
      <span
        className={`flex-none font-black tabular-nums text-plexcrew-amber ${isFirst ? 'text-lg' : ''}`}
      >
        {item.value}
      </span>
    </li>
  );
}

export function StatCard({ title, items }: { title: string; items: GlobalStat[] }) {
  return (
    <div className="rounded-2xl border border-plexcrew-teal/20 bg-plexcrew-charcoal/40 p-4 backdrop-blur-md">
      <h3 className="border-b border-plexcrew-teal/20 pb-3 text-xs font-bold uppercase tracking-widest text-plexcrew-screen">
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="mt-4 text-xs text-plexcrew-ash">Aucune donnée.</p>
      ) : (
        <ol className="pc-scrollbar mt-3 max-h-[320px] space-y-2 overflow-y-auto pr-1.5">
          {items.map((item, i) => (
            <StatRow key={item.title + i} item={item} rank={i} />
          ))}
        </ol>
      )}
    </div>
  );
}
