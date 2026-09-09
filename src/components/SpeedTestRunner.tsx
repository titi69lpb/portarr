'use client';

import { useEffect, useRef, useState } from 'react';
import { formatFileSize } from '@/lib/file-size-formatter';
import { timeoutSignal } from '@/lib/fetch-timeout';
import {
  pickNextStageSize,
  medianMs,
  bytesToMbps,
  MIN_STAGE_BYTES,
  TOTAL_TEST_BUDGET_MS,
  PING_COUNT,
} from '@/lib/speedtest';
import { SpeedTestGauge } from '@/components/SpeedTestGauge';

const DOWNLOAD_STAGE_TIMEOUT_MS = 15_000;
const PING_TIMEOUT_MS = 5_000;

type RunState = 'idle' | 'testing-download' | 'testing-latency' | 'done' | 'error';

type StageResult =
  | { kind: 'complete'; bytes: number; elapsedMs: number }
  // Cut off because the *total* test budget (or, equivalently, the per-stage
  // hang-safety cap) ran out while bytes were still arriving — not a
  // failure. The bytes received so far are still a valid (if partial)
  // sample of throughput.
  | { kind: 'budget-exceeded'; bytes: number; elapsedMs: number }
  // The caller's own AbortController fired (component unmounted mid-test) —
  // there is nothing useful to report and no component left to report it to.
  | { kind: 'aborted' }
  // A genuine failure: bad response, or the fetch/read rejected for a
  // reason other than our own timeout/unmount abort.
  | { kind: 'error' };

function isAbortError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'AbortError';
}

// Runs one download stage. `budgetRemainingMs` is how much of the *total*
// test budget is left when this stage starts — the stage is cut off at
// whichever is sooner, that remaining budget or DOWNLOAD_STAGE_TIMEOUT_MS
// (a hang-safety ceiling, since a connection could in principle be slower
// than the whole test budget without ever technically hanging). `testSignal`
// is the caller's own AbortController, aborted on unmount — when that's what
// fired, we report 'aborted' and the caller must not touch state.
async function runDownloadStage(
  sizeBytes: number,
  budgetRemainingMs: number,
  testSignal: AbortSignal
): Promise<StageResult> {
  const start = performance.now();
  const cutoffMs = Math.max(0, Math.min(DOWNLOAD_STAGE_TIMEOUT_MS, budgetRemainingMs));
  const cutoffController = new AbortController();
  const timer = setTimeout(() => cutoffController.abort(), cutoffMs);
  const signal = AbortSignal.any([cutoffController.signal, testSignal]);

  let received = 0;
  try {
    const res = await fetch(`/api/speedtest/download?size=${sizeBytes}`, { signal });
    if (!res.ok || !res.body) return { kind: 'error' };
    const reader = res.body.getReader();
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value?.length ?? 0;
    }
    return { kind: 'complete', bytes: received, elapsedMs: performance.now() - start };
  } catch (err) {
    if (testSignal.aborted) return { kind: 'aborted' };
    if (isAbortError(err)) {
      // Our own cutoff fired (budget or stage-timeout), not a network
      // failure — the bytes received so far are still a valid reading.
      return { kind: 'budget-exceeded', bytes: received, elapsedMs: performance.now() - start };
    }
    return { kind: 'error' };
  } finally {
    clearTimeout(timer);
  }
}

export function SpeedTestRunner() {
  const [state, setState] = useState<RunState>('idle');
  const [mbps, setMbps] = useState(0);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [stageSizeBytes, setStageSizeBytes] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  // If the user navigates away mid-test, abort whatever's in flight so its
  // continuation never touches state on an unmounted component.
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  async function handleStart() {
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setState('testing-download');
    setLatencyMs(null);
    setMbps(0);

    const testStart = performance.now();
    let sizeBytes = MIN_STAGE_BYTES;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      setStageSizeBytes(sizeBytes);
      const budgetRemainingMs = TOTAL_TEST_BUDGET_MS - (performance.now() - testStart);
      const result = await runDownloadStage(sizeBytes, budgetRemainingMs, controller.signal);

      if (result.kind === 'aborted') return;

      if (result.kind === 'error') {
        setState('error');
        return;
      }

      setMbps(bytesToMbps(result.bytes, result.elapsedMs));

      // Budget ran out mid-stage: treat this stage's partial reading as
      // final and move straight to the latency phase, same as a completed
      // stage that used up the last of the budget.
      if (result.kind === 'budget-exceeded') break;
      if (performance.now() - testStart >= TOTAL_TEST_BUDGET_MS) break;

      const next = pickNextStageSize(sizeBytes, result.elapsedMs);
      if (next === null) break;
      sizeBytes = next;
    }

    setState('testing-latency');
    const samples: number[] = [];
    for (let i = 0; i < PING_COUNT; i++) {
      if (controller.signal.aborted) return;
      const pingStart = performance.now();
      try {
        const res = await fetch('/api/speedtest/ping', {
          signal: AbortSignal.any([timeoutSignal(PING_TIMEOUT_MS), controller.signal]),
        });
        if (controller.signal.aborted) return;
        if (!res.ok) {
          setState('error');
          return;
        }
        samples.push(performance.now() - pingStart);
      } catch {
        if (controller.signal.aborted) return;
        setState('error');
        return;
      }
    }
    setLatencyMs(Math.round(medianMs(samples)));
    setState('done');
  }

  const isRunning = state === 'testing-download' || state === 'testing-latency';

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <SpeedTestGauge mbps={mbps} latencyMs={latencyMs} />

      {state === 'testing-download' && (
        <p className="text-xs uppercase tracking-wider text-plexcrew-ash">
          Test en cours… {formatFileSize(stageSizeBytes)}
        </p>
      )}
      {state === 'testing-latency' && (
        <p className="text-xs uppercase tracking-wider text-plexcrew-ash">Mesure de la latence…</p>
      )}
      {state === 'error' && (
        <p className="text-sm text-red-400">Le test a échoué. Vérifiez votre connexion et réessayez.</p>
      )}

      <button
        onClick={handleStart}
        disabled={isRunning}
        className="rounded-full bg-plexcrew-amber px-6 py-3 font-semibold text-plexcrew-ink transition-colors hover:bg-plexcrew-amber/90 disabled:opacity-60"
      >
        {state === 'error' ? 'Réessayer' : 'Lancer le test'}
      </button>
    </div>
  );
}
