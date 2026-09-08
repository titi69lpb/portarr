'use client';

import type { ActiveSession } from '@/lib/activity';
import { formatTimeLeft, calculateProgress } from '@/lib/now-playing-format';

function formatBandwidth(kbps: number): string {
  return `${(kbps / 1000).toFixed(1)} Mbps`;
}

function SessionCard({ session }: { session: ActiveSession }) {
  const progress = calculateProgress(session.viewOffsetMs, session.durationMs);
  const isPaused = session.state === 'paused';
  const posterUrl = `/api/newsletter/poster?path=${encodeURIComponent(session.posterPath)}`;

  return (
    <div className="relative flex h-[100px] overflow-hidden rounded-2xl border border-plexcrew-teal/20 bg-plexcrew-charcoal/40 backdrop-blur-md">
      <div className="flex h-full items-center gap-3 p-2">
        <div className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded border border-plexcrew-ash/20 bg-plexcrew-ink/60 px-1.5 py-0.5 backdrop-blur-sm">
          {session.transcodeDecision === 'transcode' && (
            <span aria-hidden="true" className="text-[10px] text-plexcrew-amber">
              ⚡
            </span>
          )}
          <span className="text-[9px] font-bold uppercase tracking-tighter text-plexcrew-ash">
            {session.player}
          </span>
        </div>
        <img
          src={posterUrl}
          alt={session.title}
          className="aspect-[2/3] h-full flex-none rounded-md object-cover ring-1 ring-plexcrew-teal/20"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
        <div className="flex h-full min-w-0 flex-1 flex-col py-1">
          <h4 className="truncate pr-16 text-[13px] font-bold text-plexcrew-screen">
            {session.title}
          </h4>
          {session.seasonNumber !== null && session.episodeNumber !== null && (
            <div className="mt-0.5 text-[10px] font-extrabold uppercase tracking-tighter text-plexcrew-amber">
              S{session.seasonNumber} • E{session.episodeNumber}
            </div>
          )}
          {session.showTitle && (
            <div className="mt-0.5 truncate text-[11px] font-medium text-plexcrew-screen/80">
              {session.showTitle}
            </div>
          )}
          <div className="mt-0.5 truncate text-[10px] text-plexcrew-ash">{session.user}</div>
          <div className="mt-auto flex items-end justify-between">
            <span className="font-mono text-[9px] text-plexcrew-ash">
              {formatBandwidth(session.bandwidthKbps)}
            </span>
            <span className="text-[12px] font-bold leading-none text-plexcrew-screen">
              {formatTimeLeft(session.viewOffsetMs, session.durationMs)}
            </span>
          </div>
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-[3px] overflow-visible bg-plexcrew-ink/50">
        <div
          className={`h-full rounded-r-full transition-all ${
            isPaused
              ? 'bg-plexcrew-amber shadow-[0_0_8px_1px_var(--tw-shadow-color)] shadow-plexcrew-amber/70'
              : 'bg-plexcrew-teal shadow-[0_0_8px_1px_var(--tw-shadow-color)] shadow-plexcrew-teal/70'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

export function NowPlaying({ sessions }: { sessions: ActiveSession[] }) {
  return (
    <section>
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="h-6 w-1.5 flex-none rounded-full bg-plexcrew-amber" />
        <h2 className="pc-eyebrow">Now Playing</h2>
      </div>
      <div className="pc-rule" />
      {sessions.length === 0 ? (
        <p className="mt-5 text-sm text-plexcrew-ash">Personne ne regarde quelque chose en ce moment.</p>
      ) : (
        <div className="mt-5 space-y-3">
          {sessions.map((session, i) => (
            <SessionCard key={`${session.user}-${session.title}-${i}`} session={session} />
          ))}
        </div>
      )}
    </section>
  );
}
