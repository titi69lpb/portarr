'use client';

import { useState, useRef, useEffect } from 'react';

type LoginState = 'idle' | 'waiting' | 'denied' | 'error';

export default function LoginPage() {
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
    <main
      className="flex min-h-screen flex-col items-center justify-center gap-4 bg-cover bg-center"
      style={{ backgroundImage: "url('/login-background.jpg')" }}
    >
      <div className="mx-4 flex max-w-sm flex-col items-center gap-5 rounded-2xl bg-plexcrew-ink/85 p-10 text-center shadow-2xl shadow-black/50 ring-1 ring-plexcrew-teal/30 backdrop-blur-md">
        <img src="/logo.png" alt="Portarr" className="h-24 w-24" />
        <h1 className="font-display text-4xl leading-none tracking-[0.1em] text-plexcrew-screen">
          Portarr
        </h1>
        {state === 'denied' && (
          <p className="text-sm text-red-400">
            Ce compte Plex n&apos;a pas accès au serveur Portarr.
          </p>
        )}
        {state === 'error' && <p className="text-sm text-red-400">Une erreur est survenue.</p>}
        {state === 'waiting' && blockedAuthUrl && (
          <p className="text-sm text-plexcrew-amber">
            Votre navigateur a bloqué la fenêtre de connexion.{' '}
            <a href={blockedAuthUrl} target="_blank" rel="noreferrer" className="underline hover:no-underline">
              Cliquez ici pour continuer
            </a>
            .
          </p>
        )}
        <button
          onClick={handleLogin}
          disabled={state === 'waiting'}
          className="rounded-full bg-plexcrew-amber px-6 py-3 font-semibold text-plexcrew-ink transition-colors hover:bg-plexcrew-amber/90 disabled:opacity-60"
        >
          {state === 'waiting' ? 'En attente de connexion Plex…' : 'Se connecter avec Plex'}
        </button>
      </div>
    </main>
  );
}
