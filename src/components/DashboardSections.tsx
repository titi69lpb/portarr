'use client';

// Drag-and-drop reordering for the dashboard's sections — order only (every
// section always stays visible, matching what was actually asked for: no
// show/hide). Persisted to localStorage rather than server-side: this is a
// "how I like my screen arranged on this device" preference, not shared
// account state like the newsletter opt-in, and it avoids a DB migration for
// what's a nice-to-have. Native HTML5 drag-and-drop — no extra dependency for
// a plain vertical-list reorder.

import { useState, useEffect, useMemo, useRef, type ReactNode } from 'react';

export interface DashboardSection {
  id: string;
  node: ReactNode;
}

const STORAGE_KEY = 'plexcrew-dashboard-order-v1';

function loadStoredOrder(): string[] | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((v) => typeof v === 'string') ? parsed : null;
  } catch {
    return null;
  }
}

function saveStoredOrder(order: string[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
  } catch {
    // Private browsing / storage disabled — reordering just won't persist
    // across reloads, no need to surface an error for that.
  }
}

// Exported (rather than kept private) so its reconciliation logic — appended
// new sections, dropped stale ones — stays unit-testable without rendering
// this 'use client' component (hooks, no jsdom in this repo's test setup).
export function applyStoredOrder(defaultIds: string[], stored: string[] | null): string[] {
  if (!stored) return defaultIds;
  // A section present in defaultIds but missing from an old stored order
  // (e.g. a future new dashboard widget) must still show up — appended at
  // the end rather than silently dropped. A stored id no longer present in
  // defaultIds (a removed widget) is just ignored.
  const known = new Set(defaultIds);
  const ordered = stored.filter((id) => known.has(id));
  const missing = defaultIds.filter((id) => !ordered.includes(id));
  return [...ordered, ...missing];
}

export function DashboardSections({ sections }: { sections: DashboardSection[] }) {
  const defaultIds = useMemo(() => sections.map((s) => s.id), [sections]);
  const [order, setOrder] = useState<string[]>(defaultIds);
  const [hydrated, setHydrated] = useState(false);
  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Read localStorage only after mount — reading it during the initial render
  // would produce a server/client markup mismatch (the server has no
  // localStorage to read from, so it always renders defaultIds).
  useEffect(() => {
    setOrder(applyStoredOrder(defaultIds, loadStoredOrder()));
    setHydrated(true);
    // defaultIds intentionally excluded: it's recomputed every render from
    // `sections` (new element references each render) and would otherwise
    // re-run this localStorage read on every render instead of just on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byId = new Map(sections.map((s) => [s.id, s.node]));
  const visibleOrder = hydrated ? order : defaultIds;

  function handleDrop(targetIndex: number) {
    const sourceIndex = dragIndexRef.current;
    dragIndexRef.current = null;
    setDragOverIndex(null);
    if (sourceIndex === null || sourceIndex === targetIndex) return;
    setOrder((prev) => {
      const next = [...prev];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      saveStoredOrder(next);
      return next;
    });
  }

  const isCustomOrder = hydrated && order.join(',') !== defaultIds.join(',');

  return (
    <div className="space-y-10">
      {isCustomOrder && (
        <button
          onClick={() => {
            setOrder(defaultIds);
            saveStoredOrder(defaultIds);
          }}
          className="text-xs text-plexcrew-ash hover:text-plexcrew-amber hover:underline"
        >
          Réinitialiser l&apos;ordre des sections
        </button>
      )}
      {visibleOrder.map((id, index) => {
        const node = byId.get(id);
        if (!node) return null;
        return (
          <div
            key={id}
            draggable
            onDragStart={() => {
              dragIndexRef.current = index;
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (dragOverIndex !== index) setDragOverIndex(index);
            }}
            onDragLeave={() => setDragOverIndex((cur) => (cur === index ? null : cur))}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop(index);
            }}
            onDragEnd={() => {
              dragIndexRef.current = null;
              setDragOverIndex(null);
            }}
            className={`group relative rounded-lg transition ${
              dragOverIndex === index ? 'ring-2 ring-plexcrew-amber/60' : ''
            }`}
          >
            <div
              className="absolute -left-6 top-0 hidden cursor-grab select-none pt-1 text-plexcrew-ash/50 transition hover:text-plexcrew-amber active:cursor-grabbing group-hover:block sm:block"
              aria-hidden="true"
              title="Glisser pour réorganiser"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                <circle cx="9" cy="6" r="1.3" />
                <circle cx="15" cy="6" r="1.3" />
                <circle cx="9" cy="12" r="1.3" />
                <circle cx="15" cy="12" r="1.3" />
                <circle cx="9" cy="18" r="1.3" />
                <circle cx="15" cy="18" r="1.3" />
              </svg>
            </div>
            {node}
          </div>
        );
      })}
    </div>
  );
}
