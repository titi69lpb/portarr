'use client';

import { useState, type FormEvent } from 'react';
import type { Locale } from '@/lib/i18n/dictionaries';
import { t } from '@/lib/i18n/translate';

type FormState = 'idle' | 'submitting' | 'denied' | 'limited' | 'error';

export function JellyfinLoginForm({ locale }: { locale: Locale }) {
  const [state, setState] = useState<FormState>('idle');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setState('submitting');
    try {
      const res = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'jellyfin', username, password }),
      });
      if (res.ok) {
        window.location.href = '/';
        return;
      }
      // Never keep a rejected password in the form state.
      setPassword('');
      setState(res.status === 401 ? 'denied' : res.status === 429 ? 'limited' : 'error');
    } catch {
      setPassword('');
      setState('error');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3">
      {state === 'denied' && (
        <p className="text-sm text-red-400">{t(locale, 'login.jellyfinBadCredentials')}</p>
      )}
      {state === 'limited' && (
        <p className="text-sm text-red-400">{t(locale, 'login.tooManyAttempts')}</p>
      )}
      {state === 'error' && <p className="text-sm text-red-400">{t(locale, 'login.genericError')}</p>}
      <input
        type="text"
        name="username"
        autoComplete="username"
        required
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder={t(locale, 'login.jellyfinUsername')}
        className="rounded-md border border-plexcrew-teal/20 bg-plexcrew-charcoal/60 px-3 py-2 text-plexcrew-screen"
      />
      <input
        type="password"
        name="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={t(locale, 'login.password')}
        className="rounded-md border border-plexcrew-teal/20 bg-plexcrew-charcoal/60 px-3 py-2 text-plexcrew-screen"
      />
      <button
        type="submit"
        disabled={state === 'submitting'}
        className="rounded-full bg-plexcrew-teal px-6 py-3 font-semibold text-plexcrew-ink transition-colors hover:bg-plexcrew-teal/90 disabled:opacity-60"
      >
        {state === 'submitting' ? t(locale, 'login.connecting') : t(locale, 'login.connectJellyfin')}
      </button>
    </form>
  );
}
