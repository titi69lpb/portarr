import type { RecentlyAddedItem, RecentlyAddedSplit } from '@/lib/plex';
import { PosterFanCarousel, type PosterCard } from '@/components/PosterFanCarousel';

// Kept as a plain exported function (no JSX, no client-only deps) so the
// security invariant it encodes — every poster src goes through the proxy,
// never a raw Plex URL / exposed X-Plex-Token — stays unit-testable in
// isolation from whatever component actually renders the <img>. This is the
// same mapping the old flat-scroll version of this component used to build
// inline; PR#40 hardened it after a real prod leak (RecentlyAdded.tsx using
// item.thumbUrl directly), so keep this narrow and easy to test.
export function buildPosterCards(items: RecentlyAddedItem[]): PosterCard[] {
  return items.map((item) => ({
    title: item.title,
    imgUrl: `/api/newsletter/poster?path=${encodeURIComponent(item.thumbPath)}`,
    href: item.plexWebUrl,
  }));
}

function RecentlyAddedSection({
  title,
  accentClassName,
  items,
}: {
  title: string;
  accentClassName: string;
  items: RecentlyAddedItem[];
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className={`h-6 w-1.5 flex-none rounded-full ${accentClassName}`} />
        <h2 className="pc-eyebrow">{title}</h2>
      </div>
      <div className="pc-rule" />
      <PosterFanCarousel cards={buildPosterCards(items)} />
    </section>
  );
}

export function RecentlyAdded({ movies, episodes }: RecentlyAddedSplit) {
  if (movies.length === 0 && episodes.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-6">
      <RecentlyAddedSection title="Films récents" accentClassName="bg-plexcrew-teal" items={movies} />
      <RecentlyAddedSection title="Séries récentes" accentClassName="bg-plexcrew-amber" items={episodes} />
    </div>
  );
}
