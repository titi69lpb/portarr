'use client';

// Fanned poster carousel for "Recently Added" — adapted from a 21st.dev
// community component (Card Fan Carousel by aayush-duhan) into this app's
// design language: aspect-[2/3] posters with title captions instead of
// full-bleed landscape photos, plexcrew-teal/amber accents instead of
// generic black/white, and a `prefers-reduced-motion` bailout the original
// didn't have. Replaces the flat horizontal scroll-strip this section used
// to be — cards fan out like a hand of movie posters and spread further
// apart on hover, closer to a boutique cinema dashboard than a generic list.

import { useState, useEffect, useRef, useCallback } from 'react';
import gsap from 'gsap';

export interface PosterCard {
  title: string;
  imgUrl: string;
  /** Deep link to the media's Plex Web detail page, or null (renders as a
   * plain, non-interactive card) when no link could be resolved. */
  href: string | null;
}

const MAX_VISIBLE = 7;
const HALF = 3;

const FAN_POSITIONS = [
  { rot: -21, scale: 0.7756, x: -30, y: 7.3, zIndex: 1 },
  { rot: -14, scale: 0.8498, x: -22, y: 4.0, zIndex: 2 },
  { rot: -7, scale: 0.9346, x: -11, y: 1.3, zIndex: 3 },
  { rot: 0, scale: 1.0, x: 0, y: 0.0, zIndex: 10 },
  { rot: 7, scale: 0.9346, x: 11, y: 1.3, zIndex: 3 },
  { rot: 14, scale: 0.8498, x: 22, y: 4.0, zIndex: 2 },
  { rot: 21, scale: 0.7756, x: 30, y: 7.3, zIndex: 1 },
];

function getResponsiveMultiplier(width: number) {
  if (width < 480) return 0.3;
  if (width < 640) return 0.42;
  if (width < 768) return 0.55;
  if (width < 1024) return 0.8;
  return 1.0;
}

function getSlotConfig(totalCards: number, slot: number) {
  if (totalCards >= MAX_VISIBLE) return FAN_POSITIONS[slot];
  const center = totalCards >> 1;
  const distance = totalCards > 1 ? (slot - center) / center : 0;
  const absDistance = Math.abs(distance);
  return {
    rot: distance * 21,
    scale: 1.0 - 0.2244 * absDistance * absDistance,
    x: distance * 30,
    y: absDistance * absDistance * 7.3,
    zIndex: 10 - Math.abs(slot - center),
  };
}

const ARROW_CLASSES =
  'relative flex items-center justify-center rounded-full border border-plexcrew-teal/25 bg-plexcrew-charcoal/60 backdrop-blur-md text-plexcrew-ash cursor-pointer shrink-0 z-30 outline-none shadow-lg shadow-black/40 hover:border-plexcrew-amber/50 hover:text-plexcrew-screen active:opacity-70 transition-colors duration-300';

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function PosterFanCarousel({ cards }: { cards: PosterCard[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isAnimating = useRef(false);
  const hasEntered = useRef(false);
  const directionRef = useRef<'left' | 'right' | null>(null);
  const prevVisible = useRef<Set<number>>(new Set());

  const totalCards = cards.length;
  const needsPagination = totalCards > MAX_VISIBLE;
  // cards is expected newest-first (RecentlyAdded builds it that way) — index
  // 0 must be the prominent centered card, not FAN_POSITIONS' array-order
  // default, or the most recent addition wouldn't be the one shown up front.
  const [centerIndex, setCenterIndex] = useState(0);

  const getVisibleMap = useCallback(
    (center: number) => {
      const map = new Map<number, number>();
      // Same circular offset-from-center math either way, just over a
      // MAX_VISIBLE-wide window when paginating vs. the full (smaller) set
      // otherwise — keeps "index 0 sits at the center slot" true in both
      // cases instead of only when there are enough cards to paginate.
      const slotCount = needsPagination ? MAX_VISIBLE : totalCards;
      const half = needsPagination ? HALF : Math.floor(totalCards / 2);
      for (let slot = 0; slot < slotCount; slot++) {
        map.set(((center + slot - half) % totalCards + totalCards) % totalCards, slot);
      }
      return map;
    },
    [totalCards, needsPagination]
  );

  const cycle = useCallback(
    (direction: 'left' | 'right') => {
      if (isAnimating.current || !needsPagination) return;
      isAnimating.current = true;
      directionRef.current = direction;
      setCenterIndex((prev) => (direction === 'right' ? (prev + 1) % totalCards : (prev - 1 + totalCards) % totalCards));
    },
    [totalCards, needsPagination]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !totalCards) return;

    const cardElements = Array.from(container.querySelectorAll<HTMLElement>('.fan-card'));
    if (!cardElements.length) return;

    const visibleMap = getVisibleMap(centerIndex);
    const previouslyVisible = prevVisible.current;
    const direction = directionRef.current;
    const isFirstMount = !hasEntered.current;
    const reduced = prefersReducedMotion();
    const multiplier = getResponsiveMultiplier(window.innerWidth);
    const slotCount = needsPagination ? MAX_VISIBLE : totalCards;
    const config = (slot: number) => getSlotConfig(slotCount, slot);

    if (isFirstMount) isAnimating.current = true;

    let completedCount = 0;
    const visibleCount = visibleMap.size;
    const onCardDone = () => {
      if (++completedCount >= visibleCount) {
        isAnimating.current = false;
        if (isFirstMount) hasEntered.current = true;
      }
    };

    cardElements.forEach((card, cardIndex) => {
      const slot = visibleMap.get(cardIndex);
      const wasVisible = previouslyVisible.has(cardIndex);

      if (slot !== undefined) {
        const { x, y, rot, scale, zIndex } = config(slot);
        const target = {
          x: `${x * multiplier}%`,
          y: `${y * multiplier}%`,
          rotation: rot,
          scale,
          opacity: 1,
          zIndex,
        };

        if (reduced) {
          gsap.set(card, target);
          onCardDone();
        } else if (isFirstMount) {
          gsap.set(card, { x: 0, y: '30%', rotation: 0, scale: 0.5, opacity: 0 });
          gsap.to(card, { ...target, duration: 1.1, ease: 'elastic.out(1.05,.78)', delay: 0.15 + slot * 0.06, onComplete: onCardDone });
        } else if (!wasVisible) {
          const enterX = direction === 'right' ? 60 : -60;
          gsap.set(card, { x: `${enterX}%`, y: target.y, rotation: direction === 'right' ? 30 : -30, scale: 0.5, opacity: 0 });
          gsap.to(card, { ...target, duration: 0.5, ease: 'power2.out', onComplete: onCardDone });
        } else {
          gsap.to(card, { ...target, duration: 0.45, ease: 'power2.out', onComplete: onCardDone });
        }
      } else if (wasVisible) {
        const exitX = direction === 'right' ? -60 : 60;
        if (reduced) {
          gsap.set(card, { opacity: 0, zIndex: 0 });
        } else {
          gsap.to(card, { x: `${exitX}%`, opacity: 0, scale: 0.5, rotation: direction === 'right' ? -30 : 30, duration: 0.35, ease: 'power2.in', zIndex: 0 });
        }
      } else if (isFirstMount) {
        gsap.set(card, { opacity: 0, scale: 0.3, x: 0, y: 0, zIndex: 0 });
      }
    });

    prevVisible.current = new Set(visibleMap.keys());
    if (reduced) return;

    // Hover spread — pushes neighbouring cards aside and lifts the hovered one.
    const visibleEntries: { el: HTMLElement; slot: number }[] = [];
    cardElements.forEach((el, i) => {
      const slot = visibleMap.get(i);
      if (slot !== undefined) visibleEntries.push({ el, slot });
    });
    visibleEntries.sort((a, b) => a.slot - b.slot);

    let activeSlot: number | null = null;
    let leaveTimer: ReturnType<typeof setTimeout> | null = null;
    const centerSlot = visibleEntries.length >> 1;

    const updateHoverLayout = (hoveredSlot: number | null) => {
      const mult = getResponsiveMultiplier(window.innerWidth);
      visibleEntries.forEach(({ el, slot }) => {
        const base = config(slot);
        let targetX = base.x * mult;
        let targetY = base.y * mult;
        let targetRot = base.rot;
        let targetScale = base.scale;
        let delay = 0;

        if (hoveredSlot !== null) {
          const distance = Math.abs(slot - hoveredSlot);
          delay = distance * 0.02;
          if (slot === hoveredSlot) {
            targetY -= 6;
            targetScale *= 1.08;
          } else {
            const normalized = centerSlot > 0 ? (slot - centerSlot) / centerSlot : 0;
            const pushStrength = 9 * (1 - Math.abs(normalized)) * (1 + 0.2 * Math.max(0, 3 - distance));
            if (slot < hoveredSlot) {
              targetX -= pushStrength * mult;
              targetRot -= 3 / (distance + 1);
            } else {
              targetX += pushStrength * mult;
              targetRot += 3 / (distance + 1);
            }
          }
        } else {
          delay = Math.abs(slot - centerSlot) * 0.02;
        }

        gsap.to(el, {
          x: `${targetX}%`,
          y: `${targetY}%`,
          rotation: targetRot,
          scale: targetScale,
          duration: 0.5,
          delay,
          ease: 'elastic.out(1,.75)',
          overwrite: 'auto',
        });
        gsap.set(el, { zIndex: base.zIndex });
      });
    };

    const enterHandlers = visibleEntries.map(({ el, slot }) => {
      const handler = () => {
        if (isAnimating.current) return;
        if (leaveTimer) {
          clearTimeout(leaveTimer);
          leaveTimer = null;
        }
        if (activeSlot !== slot) {
          activeSlot = slot;
          updateHoverLayout(slot);
        }
      };
      el.addEventListener('mouseenter', handler);
      return { el, handler };
    });

    const onMouseLeave = () => {
      if (isAnimating.current) return;
      if (leaveTimer) clearTimeout(leaveTimer);
      leaveTimer = setTimeout(() => {
        activeSlot = null;
        updateHoverLayout(null);
      }, 50);
    };
    container.addEventListener('mouseleave', onMouseLeave);

    const onResize = () => {
      if (!isAnimating.current) updateHoverLayout(activeSlot);
    };
    window.addEventListener('resize', onResize);

    return () => {
      enterHandlers.forEach(({ el, handler }) => el.removeEventListener('mouseenter', handler));
      container.removeEventListener('mouseleave', onMouseLeave);
      window.removeEventListener('resize', onResize);
      if (leaveTimer) clearTimeout(leaveTimer);
    };
  }, [centerIndex, totalCards, getVisibleMap, needsPagination]);

  if (!totalCards) return null;

  const chevron = (direction: 'left' | 'right') => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 sm:h-5 sm:w-5">
      <polyline points={direction === 'left' ? '15 18 9 12 15 6' : '9 18 15 12 9 6'} />
    </svg>
  );

  return (
    <div className="flex flex-col items-center">
      <div
        ref={containerRef}
        className="fan-layout relative mt-6 flex h-[220px] w-full max-w-3xl items-center justify-center sm:h-[280px]"
      >
        {cards.map((card, i) => {
          // block is required here: an <a> defaults to display:inline, and an
          // inline box ignores width/height/aspect-ratio entirely — without it
          // the href variant collapses to 0x0 (poster invisible) while the
          // plain <div> fallback looked fine only because divs are block by
          // default. Applying it to both keeps the two branches identical.
          const posterClassName =
            'group relative block aspect-[2/3] w-full overflow-hidden rounded-md bg-plexcrew-charcoal shadow-lg shadow-black/50 ring-1 ring-plexcrew-teal/20';
          const poster = (
            <>
              <img src={card.imgUrl} alt={card.title} className="absolute inset-0 h-full w-full object-cover" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-plexcrew-ink/90 to-transparent p-2 pt-6">
                <p className="truncate text-[11px] font-medium text-plexcrew-screen">{card.title}</p>
              </div>
            </>
          );
          return (
            <div key={`${card.title}-${i}`} className="fan-card absolute w-28 sm:w-36">
              {card.href ? (
                <a
                  href={card.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${posterClassName} cursor-pointer transition-shadow motion-safe:duration-200 hover:ring-plexcrew-amber/60`}
                >
                  {poster}
                </a>
              ) : (
                <div className={posterClassName}>{poster}</div>
              )}
            </div>
          );
        })}
      </div>

      {needsPagination && (
        <div className="z-30 mt-4 flex items-center justify-center gap-4">
          <button className={`${ARROW_CLASSES} h-9 w-9 sm:h-10 sm:w-10`} onClick={() => cycle('left')} aria-label="Précédent">
            {chevron('left')}
          </button>
          <div className="flex items-center gap-1.5">
            {cards.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-1.5 rounded-full transition-all duration-300 ${
                  i === centerIndex ? 'scale-125 bg-plexcrew-amber' : 'bg-plexcrew-teal/25'
                }`}
              />
            ))}
          </div>
          <button className={`${ARROW_CLASSES} h-9 w-9 sm:h-10 sm:w-10`} onClick={() => cycle('right')} aria-label="Suivant">
            {chevron('right')}
          </button>
        </div>
      )}
    </div>
  );
}
