/**
 * Twelve bulbs on narrow screens, twenty-four once there's room — the odd ones
 * drop out below `sm` so the spacing never collapses on a phone.
 */
const BULBS = Array.from({ length: 24 }, (_, i) => i);

export function AnnouncementBanner({ html }: { html: string | null }) {
  if (!html) return null;
  return (
    <section
      aria-label="Annonce"
      className="pc-glass-surface overflow-hidden rounded-t-2xl rounded-b-md shadow-lg shadow-black/40 ring-1 ring-plexcrew-teal/20"
    >
      {/* The lit top edge of the sign: amber rule, then the bulb strip. */}
      <div className="h-1 w-full bg-plexcrew-amber" />
      <div
        aria-hidden="true"
        className="flex items-center justify-between bg-gradient-to-b from-plexcrew-amber/10 to-transparent px-5 pb-4 pt-3"
      >
        {BULBS.map((i) => (
          <span key={i} className={`pc-bulb ${i % 2 === 1 ? 'hidden sm:block' : ''}`} />
        ))}
      </div>

      <div
        className="prose prose-invert prose-sm pc-prose max-w-none px-6 pb-6 pt-1"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </section>
  );
}
