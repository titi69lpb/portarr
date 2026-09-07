import { describe, it, expect } from 'vitest';
import { applyStoredOrder } from '../../src/components/DashboardSections';

// applyStoredOrder is exported as a plain function (no JSX, no hooks) so this
// reconciliation logic stays testable without rendering DashboardSections
// itself — a 'use client' component with hooks, out of scope for this
// repo's no-jsdom test setup (same convention as login/page.tsx,
// HistoryLoadMore.tsx, PosterFanCarousel.tsx).

describe('applyStoredOrder', () => {
  const defaultIds = ['now-playing', 'recently-added', 'calendar', 'stats-global', 'pending-requests', 'stats-personal'];

  it('returns the default order when nothing is stored', () => {
    expect(applyStoredOrder(defaultIds, null)).toEqual(defaultIds);
  });

  it('returns the stored order verbatim when it matches the known ids exactly', () => {
    const stored = ['stats-personal', 'now-playing', 'calendar', 'recently-added', 'pending-requests', 'stats-global'];
    expect(applyStoredOrder(defaultIds, stored)).toEqual(stored);
  });

  it('appends a section missing from an old stored order instead of dropping it', () => {
    const stored = ['stats-personal', 'now-playing'];
    const result = applyStoredOrder(defaultIds, stored);
    expect(result.slice(0, 2)).toEqual(['stats-personal', 'now-playing']);
    expect(result).toContain('calendar');
    expect(result).toContain('stats-global');
    expect(result).toContain('pending-requests');
    expect(result).toContain('recently-added');
    expect(result).toHaveLength(defaultIds.length);
  });

  it('drops a stored id that no longer exists as a section', () => {
    const stored = ['now-playing', 'a-removed-widget', 'calendar'];
    const result = applyStoredOrder(defaultIds, stored);
    expect(result).not.toContain('a-removed-widget');
    expect(result).toHaveLength(defaultIds.length);
  });

  it('does not duplicate an id that appears in both the kept prefix and the appended remainder', () => {
    const stored = ['calendar', 'now-playing'];
    const result = applyStoredOrder(defaultIds, stored);
    const counts = new Map<string, number>();
    for (const id of result) counts.set(id, (counts.get(id) ?? 0) + 1);
    for (const count of counts.values()) expect(count).toBe(1);
  });
});
