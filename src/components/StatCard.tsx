import type { GlobalStat } from '@/lib/tautulli';

const RANK_COLORS = ['text-plexcrew-amber', 'text-plexcrew-screen', 'text-plexcrew-ash'];

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
            <li key={item.title + i} className="flex items-center gap-3">
              <span className={`w-5 flex-none font-mono text-xs ${RANK_COLORS[i] ?? 'text-plexcrew-ash'}`}>
                {String(i + 1).padStart(2, '0')}
              </span>
              {item.posterPath && (
                <img
                  src={`/api/newsletter/poster?path=${encodeURIComponent(item.posterPath)}`}
                  alt=""
                  className="h-9 w-6 flex-none rounded object-cover ring-1 ring-plexcrew-teal/20"
                />
              )}
              <span className="min-w-0 flex-1 truncate text-sm text-plexcrew-screen">{item.title}</span>
              <span className="flex-none font-black tabular-nums text-plexcrew-amber">{item.value}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
