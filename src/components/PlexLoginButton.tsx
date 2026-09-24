'use client';

import { useState, useRef, useEffect } from 'react';
import type { Locale } from '@/lib/i18n/dictionaries';
import { t } from '@/lib/i18n/translate';

type LoginState = 'idle' | 'waiting' | 'denied' | 'error';

export function PlexLoginButton({ locale }: { locale: Locale }) {
  const [state, setState] = useState<LoginState>('idle');
  // Set when window.open() was blocked by the browser's popup blocker — the
  // login flow was silently stuck at "En attente…" for the full 60s timeout
  // with no indication anything had gone wrong. authUrl is kept so the
  // fallback link below can offer the same destination for a manual click.
  const [blockedAuthUrl, setBlockedAuthUrl] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const authWindowRef = useRef<Window | null>(null);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  async function handleLogin() {
    setState('waiting');
    setBlockedAuthUrl(null);
    const loginRes = await fetch('/api/auth/login', { method: 'POST' });
    if (!loginRes.ok) {
      setState('error');
      return;
    }
    const { pinId, authUrl } = (await loginRes.json()) as { pinId: number; authUrl: string };
    // No noopener/noreferrer here: authUrl is always the hardcoded, trusted
    // app.plex.tv auth page (never user-supplied), and we need the window
    // reference back so we can close it automatically once login succeeds —
    // Plex's own success page just tells the user to close it manually
    // otherwise, and leaves a stale tab behind.
    authWindowRef.current = window.open(authUrl, '_blank');

    // A blocked popup returns null, or (some blockers) a window that reports
    // itself already closed. Either way, the user was previously stuck at
    // "En attente de connexion Plex…" for a full 60s with zero indication a
    // popup had even been attempted. Polling still starts below regardless —
    // if the user opens the fallback link manually, it picks the login up.
    if (!authWindowRef.current || authWindowRef.current.closed) {
      setBlockedAuthUrl(authUrl);
    }

    let attempts = 0;
    const maxAttempts = 30; // 30 * 2s = 60s timeout

    intervalRef.current = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
        setState('error');
        return;
      }

      try {
        const pollRes = await fetch(`/api/auth/poll?pinId=${pinId}`);
        if (!pollRes.ok) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          intervalRef.current = null;
          setState('error');
          return;
        }
        const data = (await pollRes.json()) as { status: 'pending' | 'denied' | 'ok' };
        if (data.status === 'ok') {
          if (intervalRef.current) clearInterval(intervalRef.current);
          intervalRef.current = null;
          authWindowRef.current?.close();
          window.location.href = '/';
        } else if (data.status === 'denied') {
          if (intervalRef.current) clearInterval(intervalRef.current);
          intervalRef.current = null;
          authWindowRef.current?.close();
          setState('denied');
        }
      } catch (error) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
        setState('error');
      }
    }, 2000);
  }

  return (
    <>
      {state === 'denied' && (
        <p className="text-sm text-red-400">
          {t(locale, 'login.accessDenied')}
        </p>
      )}
      {state === 'error' && <p className="text-sm text-red-400">{t(locale, 'login.genericError')}</p>}
      {state === 'waiting' && blockedAuthUrl && (
        <p className="text-sm text-plexcrew-amber">
          {t(locale, 'login.popupBlocked')}{' '}
          <a href={blockedAuthUrl} target="_blank" rel="noreferrer" className="underline hover:no-underline">
            {t(locale, 'login.clickToContinue')}
          </a>
          .
        </p>
      )}
      <button
        onClick={handleLogin}
        disabled={state === 'waiting'}
        className="rounded-full bg-plexcrew-amber px-6 py-3 font-semibold text-plexcrew-ink transition-colors hover:bg-plexcrew-amber/90 disabled:opacity-60"
      >
        {state === 'waiting' ? t(locale, 'login.waiting') : t(locale, 'login.connect')}
      </button>
    </>
  );
}
