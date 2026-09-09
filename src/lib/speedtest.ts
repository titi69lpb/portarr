// Escalation rule for the adaptive download stages: a stage that finished
// well under the threshold couldn't have been network-bound long enough to
// trust — double it and measure again. A stage that took at least the
// threshold is trusted as final. Kept as a pure function (no fetch/timers)
// so the escalation decision is unit-testable without a network.
export const MIN_STAGE_BYTES = 2 * 1024 * 1024;
export const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024;
export const STAGE_FAST_THRESHOLD_MS = 1500;

// Overall test budget enforced by the caller (SpeedTestRunner), not by this
// function — pickNextStageSize only ever sees one stage's own size/duration.
export const TOTAL_TEST_BUDGET_MS = 10_000;

export const PING_COUNT = 5;

// Threshold below which latency is shown as "good" in the UI. 80ms roughly
// separates typical wired/fiber round-trips to the LAN server from
// connections routed through congested Wi-Fi or a distant/VPN path.
export const GOOD_LATENCY_MS = 80;

// Ceiling for the gauge's log scale (see mbpsToArcFraction) — covers
// realistic residential connections through LAN/fiber gigabit.
export const GAUGE_MAX_MBPS = 1000;

export function pickNextStageSize(
  currentSizeBytes: number,
  elapsedMs: number,
  maxBytes: number = MAX_DOWNLOAD_BYTES
): number | null {
  if (elapsedMs >= STAGE_FAST_THRESHOLD_MS) return null;
  const doubled = currentSizeBytes * 2;
  if (doubled > maxBytes) return null;
  return doubled;
}

// Median instead of mean: robust against one outlier round-trip (a GC pause,
// a retried TCP segment) skewing the result the way an average would.
export function medianMs(samples: number[]): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function bytesToMbps(bytes: number, elapsedMs: number): number {
  if (elapsedMs <= 0) return 0;
  const mbps = (bytes * 8) / (elapsedMs / 1000) / 1_000_000;
  return Math.round(mbps * 10) / 10;
}

// Log scale rather than linear: a linear scale to a fixed max would leave
// the needle pinned near zero for typical residential connections (a few
// hundred Mbps at most) while still needing headroom for LAN/fiber gigabit
// tests. log10 spreads both ranges legibly across the same arc.
export function mbpsToArcFraction(mbps: number, maxMbps: number = GAUGE_MAX_MBPS): number {
  if (mbps <= 0) return 0;
  const fraction = Math.log10(mbps + 1) / Math.log10(maxMbps + 1);
  return Math.min(1, Math.max(0, fraction));
}
