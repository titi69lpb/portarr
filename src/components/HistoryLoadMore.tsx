'use client';

import { useState } from 'react';
import type { RecentHistoryItem } from '@/lib/tautulli';

function HistoryTile({ item, index }: { item: RecentHistoryItem; index: number }) {
  return (
    <div key={`${item.thumbPath}-${index}`} className="w-full">
      <img
        src={`/api/newsletter/poster?path=${encodeURIComponent(item.thumbPath)}`}
        alt={item.title}
        className="aspect-[2/3] w-full rounded-md object-cover ring-1 ring-plexcrew-teal/20"
      />
      <p className="mt-1.5 truncate text-xs text-plexcrew-screen/80">{item.title}</p>
      <p className="text-[11px] text-plexcrew-ash">{new Date(item.watchedAt).toLocaleDateString('fr-FR')}</p>
    </div>
  );
}

export function HistoryLoadMore({
  initialItems,
  initialTotal,
}: {
  initialItems: RecentHistoryItem[];
  initialTotal: number;
}) {
  const [items, setItems] = useState(initialItems);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const hasMore = items.length < initialTotal;

  async function loadMore() {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/history?offset=${items.length}`);
      if (!res.ok) throw new Error(`request failed: ${res.status}`);
      const page = (await res.json()) as { items: RecentHistoryItem[]; total: number };
      setItems((prev) => [...prev, ...page.items]);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  if (items.length === 0) {
    return <p className="text-sm text-plexcrew-ash">Aucun historique de visionnage.</p>;
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8">
        {items.map((item, i) => (
          <HistoryTile key={`${item.thumbPath}-${i}`} item={item} index={i} />
        ))}
      </div>
      {hasMore && (
        <div className="mt-6 flex flex-col items-center gap-2">
          <button
            onClick={loadMore}
            disabled={loading}
            className="rounded-full bg-plexcrew-teal/20 px-5 py-2 text-sm font-medium text-plexcrew-screen ring-1 ring-plexcrew-teal/40 transition-colors hover:bg-plexcrew-teal/30 disabled:opacity-60"
          >
            {loading ? 'Chargement…' : 'Charger plus'}
          </button>
          {error && <p className="text-xs text-red-400">Échec du chargement, réessayez.</p>}
        </div>
      )}
    </>
  );
}
