import type { PendingRequest } from '@/lib/overseerr';

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w300';

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
        <div className="pc-scrollbar mt-5 flex gap-4 overflow-x-auto pb-2">
          {requests.map((r) => (
            <div key={r.title + r.requestedAt} className="w-28 flex-none sm:w-32">
              {r.posterPath ? (
                <img
                  src={`${TMDB_IMAGE_BASE}${r.posterPath}`}
                  alt=""
                  className="aspect-[2/3] w-full rounded-md object-cover ring-1 ring-plexcrew-teal/20"
                />
              ) : (
                <div className="aspect-[2/3] w-full rounded-md bg-plexcrew-charcoal ring-1 ring-plexcrew-teal/20" />
              )}
              <p className="mt-2 truncate text-xs font-medium text-plexcrew-screen">{r.title}</p>
              <p className="truncate text-[10px] text-plexcrew-ash">Demandé par {r.requestedByUsername}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
