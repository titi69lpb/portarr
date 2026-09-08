import type { PendingRequest } from '@/lib/overseerr';

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w300';

const DAY_MS = 86_400_000;

export function requestedAgoLabel(requestedAt: string, now: number = Date.now()): string {
  const days = Math.floor((now - new Date(requestedAt).getTime()) / DAY_MS);
  if (days <= 0) return "Aujourd'hui";
  if (days === 1) return 'Hier';
  if (days < 30) return `Il y a ${days} j`;
  const months = Math.floor(days / 30);
  return `Il y a ${months} mois`;
}

export function PendingRequests({ requests }: { requests: PendingRequest[] }) {
  return (
    <section>
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="h-6 w-1.5 flex-none rounded-full bg-plexcrew-amber" />
        <h2 className="pc-eyebrow">Demandes en cours</h2>
      </div>
      <div className="pc-rule" />
      {requests.length === 0 ? (
        <p className="mt-5 text-sm text-plexcrew-ash">Aucune demande en cours de traitement.</p>
      ) : (
        // Deliberately dense (small tiles, tight gap) so the whole backlog
        // fits without scrolling — each tile scales up on hover instead of
        // reserving space for a permanently-visible caption. `overflow-visible`
        // relies on no ancestor clipping (verified: no overflow-hidden between
        // this grid and the page body), so the hover-scaled tile isn't cut off.
        <div className="mt-5 grid grid-cols-6 gap-1.5 sm:grid-cols-8 sm:gap-2 md:grid-cols-10 lg:grid-cols-12 xl:grid-cols-14">
          {requests.map((r) => (
            <div
              key={r.title + r.requestedAt}
              // Named group (group/req) — this page already nests an unnamed
              // `group` on the drag-reorder card wrapper (DashboardSections.tsx),
              // and an unnamed group-hover here would fire for every tile at
              // once as soon as the pointer entered that ancestor card, not
              // just the tile actually under the cursor (verified live: every
              // overlay lit up together on a single-tile hover before this fix).
              className="group/req relative aspect-[2/3] w-full cursor-default overflow-hidden rounded-sm ring-1 ring-plexcrew-teal/15 transition-transform duration-200 ease-out hover:z-30 hover:scale-[1.9] hover:rounded-md hover:ring-2 hover:ring-plexcrew-amber/60 hover:shadow-2xl hover:shadow-black/70"
            >
              {r.posterPath ? (
                <img
                  src={`${TMDB_IMAGE_BASE}${r.posterPath}`}
                  alt={r.title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-full w-full bg-plexcrew-charcoal" />
              )}
              <span
                aria-hidden="true"
                className={`absolute left-1 top-1 h-1.5 w-1.5 rounded-full opacity-90 transition-opacity duration-150 group-hover/req:opacity-0 ${
                  r.type === 'movie' ? 'bg-plexcrew-teal' : 'bg-plexcrew-amber'
                }`}
              />
              <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/30 to-transparent p-1.5 opacity-0 transition-opacity duration-150 group-hover/req:opacity-100">
                <span
                  className={`mb-1 w-fit rounded-full px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide ${
                    r.type === 'movie' ? 'bg-plexcrew-teal text-plexcrew-screen' : 'bg-plexcrew-amber text-plexcrew-ink'
                  }`}
                >
                  {r.type === 'movie' ? 'Film' : 'Série'}
                </span>
                <p className="truncate text-[11px] font-medium leading-tight text-plexcrew-screen">{r.title}</p>
                <p className="truncate text-[9px] leading-tight text-plexcrew-ash">
                  {r.requestedByUsername} · {requestedAgoLabel(r.requestedAt)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
