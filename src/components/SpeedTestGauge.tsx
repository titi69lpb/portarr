// src/components/SpeedTestGauge.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import type { Locale } from '@/lib/i18n/dictionaries';
import { t } from '@/lib/i18n/translate';
import { mbpsToArcFraction, mbpsQualityTier, GAUGE_MAX_MBPS, GOOD_LATENCY_MS } from '@/lib/speedtest';

const RADIUS = 100;
const CENTER_X = 120;
const CENTER_Y = 120;
// Half the circumference of a 180° arc of this radius — the exact path
// length, used as both stroke-dasharray and the basis for dashoffset so the
// gradient stroke fills proportionally to mbpsToArcFraction.
const ARC_LENGTH = Math.PI * RADIUS;
const ARC_PATH = `M ${CENTER_X - RADIUS} ${CENTER_Y} A ${RADIUS} ${RADIUS} 0 0 1 ${CENTER_X + RADIUS} ${CENTER_Y}`;

export interface SpeedTestGaugeProps {
  mbps: number;
  latencyMs: number | null;
  locale: Locale;
}

export function SpeedTestGauge({ mbps, latencyMs, locale }: SpeedTestGaugeProps) {
  const [displayMbps, setDisplayMbps] = useState(0);
  // A plain tweened object rather than tweening React state directly — gsap
  // needs a stable object to mutate every tick; onUpdate then mirrors its
  // current value into React state so the SVG re-renders each frame.
  const tweenValue = useRef({ value: 0 });

  useEffect(() => {
    const tween = gsap.to(tweenValue.current, {
      value: mbps,
      duration: 0.9,
      ease: 'power2.out',
      onUpdate: () => setDisplayMbps(tweenValue.current.value),
    });
    return () => {
      tween.kill();
    };
  }, [mbps]);

  const fraction = mbpsToArcFraction(displayMbps, GAUGE_MAX_MBPS);
  const dashOffset = ARC_LENGTH * (1 - fraction);
  const latencyGood = latencyMs !== null && latencyMs < GOOD_LATENCY_MS;

  // Only shown once a real reading exists — before the first stage
  // completes, displayMbps is still 0 and a "Low" verdict would be
  // misleading noise rather than a result.
  const tier = displayMbps > 0 ? mbpsQualityTier(displayMbps) : null;
  const tierLabel =
    tier === 'excellent'
      ? t(locale, 'speedTest.qualityExcellent')
      : tier === 'ok'
        ? t(locale, 'speedTest.qualityOk')
        : tier === 'low'
          ? t(locale, 'speedTest.qualityLow')
          : null;
  const tierColorClass =
    tier === 'excellent' ? 'text-plexcrew-teal' : tier === 'low' ? 'text-plexcrew-amber' : 'text-plexcrew-ash';

  return (
    <div className="flex flex-col items-center gap-4">
      <svg viewBox="0 0 240 140" className="w-full max-w-xs overflow-visible">
        <defs>
          <linearGradient id="speedGaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#2F6E63" />
            <stop offset="100%" stopColor="#E2A33B" />
          </linearGradient>
        </defs>
        <path d={ARC_PATH} fill="none" stroke="#211C18" strokeWidth={14} strokeLinecap="round" />
        <path
          d={ARC_PATH}
          fill="none"
          stroke="url(#speedGaugeGradient)"
          strokeWidth={14}
          strokeLinecap="round"
          strokeDasharray={ARC_LENGTH}
          strokeDashoffset={dashOffset}
          style={{ filter: 'drop-shadow(0 0 6px rgba(226, 163, 59, 0.55))' }}
        />
        <text
          x={CENTER_X}
          y={CENTER_Y - 40}
          textAnchor="middle"
          className="fill-plexcrew-ash"
          style={{ fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase' }}
        >
          {t(locale, 'speedTest.download')}
        </text>
        <text
          x={CENTER_X}
          y={CENTER_Y - 8}
          textAnchor="middle"
          className="font-display fill-plexcrew-screen"
          style={{ fontSize: 36 }}
        >
          {displayMbps.toFixed(1)}
        </text>
        <text
          x={CENTER_X}
          y={CENTER_Y + 16}
          textAnchor="middle"
          className="fill-plexcrew-amber"
          style={{ fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase' }}
        >
          {t(locale, 'speedTest.mbps')}
        </text>
      </svg>
      {tierLabel && (
        <p className={`text-xs font-semibold uppercase tracking-[0.14em] ${tierColorClass}`}>{tierLabel}</p>
      )}
      <div className="flex items-center gap-2 rounded-full bg-plexcrew-charcoal/60 px-4 py-1.5 ring-1 ring-plexcrew-teal/20">
        <span
          className={`h-2 w-2 flex-none rounded-full ${latencyGood ? 'bg-plexcrew-teal' : 'bg-plexcrew-amber'}`}
          style={{
            boxShadow: latencyGood
              ? '0 0 6px 1px rgba(47, 110, 99, 0.6)'
              : '0 0 6px 1px rgba(226, 163, 59, 0.6)',
          }}
        />
        <span className="text-xs text-plexcrew-ash">{t(locale, 'speedTest.latency')}</span>
        <span className="font-mono text-sm text-plexcrew-screen">
          {latencyMs === null ? '—' : `${latencyMs} ${t(locale, 'speedTest.ms')}`}
        </span>
      </div>
    </div>
  );
}
