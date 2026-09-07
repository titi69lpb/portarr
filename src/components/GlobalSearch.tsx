'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface SearchResultItem {
  title: string;
  year: number | null;
  type: 'movie' | 'show';
  thumbPath: string | null;
  plexWebUrl: string | null;
}

const DEBOUNCE_MS = 300;

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  const closeModal = useCallback(() => {
    setOpen(false);
    setQuery('');
    setResults([]);
    setError(false);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) closeModal();
      // Cmd/Ctrl+K opens search from anywhere in the portal.
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, closeModal]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      setError(false);
      return;
    }
    setLoading(true);
    setError(false);
    const thisRequestId = ++requestIdRef.current;
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (!res.ok) throw new Error(`request failed: ${res.status}`);
        const data = (await res.json()) as { results: SearchResultItem[] };
        // A slower earlier request resolving after a faster later one would
        // otherwise flash stale results back onto the screen mid-typing.
        if (thisRequestId === requestIdRef.current) setResults(data.results);
      } catch {
        if (thisRequestId === requestIdRef.current) setError(true);
      } finally {
        if (thisRequestId === requestIdRef.current) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg px-2 py-2 text-plexcrew-screen transition hover:bg-plexcrew-teal/10 hover:text-plexcrew-amber sm:w-full"
        aria-label="Rechercher"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5 flex-none">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <span className="hidden truncate text-xs font-medium sm:inline">Rechercher</span>
      </button>

      {open &&
        createPortal(
          // Portalled to document.body rather than rendered inline: this
          // button lives inside AppSidebar's <aside>, which has a
          // backdrop-blur (pc-glass-surface-strong) — any backdrop-filter/
          // filter/transform on an ancestor creates a new containing block
          // for position:fixed descendants, so without the portal this
          // modal rendered fixed *inside the sidebar's own bounding box*
          // instead of centered over the full viewport (caught visually,
          // not by reasoning about the CSS — a real screenshot showed the
          // modal pinned to the top-left ~160px sidebar column).
          <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-[12vh] backdrop-blur-sm" onClick={closeModal}>
          <div
            className="pc-glass-surface-strong w-full max-w-xl rounded-xl ring-1 ring-plexcrew-teal/30 shadow-2xl shadow-black/60"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-plexcrew-teal/15 px-4 py-3">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5 flex-none text-plexcrew-ash">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Chercher un film, une série…"
                className="flex-1 bg-transparent text-sm text-plexcrew-screen outline-none placeholder:text-plexcrew-ash"
              />
              <button onClick={closeModal} className="text-plexcrew-ash hover:text-plexcrew-screen" aria-label="Fermer">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>

            <div className="max-h-[55vh] overflow-y-auto p-3">
              {loading && <p className="px-2 py-4 text-center text-xs text-plexcrew-ash">Recherche…</p>}
              {!loading && error && (
                <p className="px-2 py-4 text-center text-xs text-red-400">Échec de la recherche, réessayez.</p>
              )}
              {!loading && !error && query.trim() && results.length === 0 && (
                <p className="px-2 py-4 text-center text-xs text-plexcrew-ash">Aucun résultat.</p>
              )}
              {!loading && !error && results.length > 0 && (
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                  {results.map((r, i) => {
                    const poster = r.thumbPath ? (
                      <img
                        src={`/api/newsletter/poster?path=${encodeURIComponent(r.thumbPath)}`}
                        alt={r.title}
                        className={`aspect-[2/3] w-full rounded-md bg-plexcrew-charcoal object-cover ring-1 ring-plexcrew-teal/20 ${
                          r.plexWebUrl ? 'transition motion-safe:duration-200 motion-safe:group-hover:-translate-y-1 motion-safe:group-hover:ring-plexcrew-amber/60' : ''
                        }`}
                      />
                    ) : (
                      <div className="aspect-[2/3] w-full rounded-md bg-plexcrew-charcoal ring-1 ring-plexcrew-teal/20" />
                    );
                    const caption = (
                      <>
                        <p className="mt-1.5 truncate text-[11px] text-plexcrew-screen/80">{r.title}</p>
                        <p className="text-[10px] text-plexcrew-ash">
                          {r.type === 'movie' ? 'Film' : 'Série'}
                          {r.year ? ` · ${r.year}` : ''}
                        </p>
                      </>
                    );
                    return r.plexWebUrl ? (
                      <a key={`${r.title}-${i}`} href={r.plexWebUrl} target="_blank" rel="noopener noreferrer" className="group w-full">
                        {poster}
                        {caption}
                      </a>
                    ) : (
                      <div key={`${r.title}-${i}`} className="w-full">
                        {poster}
                        {caption}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>,
          document.body
        )}
    </>
  );
}
