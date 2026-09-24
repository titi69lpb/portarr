'use client';

import { useState } from 'react';
import { ServiceSettingsForm } from './ServiceSettingsForm';
import { SERVICE_FIELDS, type ServiceKey } from '@/lib/settings-schema';
import type { ConfigSource } from '@/lib/config';
import type { Locale } from '@/lib/i18n/dictionaries';
import { LOCALES } from '@/lib/i18n/dictionaries';
import { t } from '@/lib/i18n/translate';
import { resolveStepError } from '@/lib/settings-error';

const STEPS: ServiceKey[] = ['publicBaseUrl', 'plex', 'tautulli', 'jellyfin', 'jellystat', 'jellyfinActivitySource', 'sonarr', 'radarr', 'overseerr', 'smtp'];

export function SetupWizard({
  token,
  sources,
  locale: initialLocale,
  showLanguageStep = true,
}: {
  token: string;
  sources: Record<string, ConfigSource>;
  locale: Locale;
  showLanguageStep?: boolean;
}) {
  // Wizard-local locale: switching language re-renders the whole wizard at
  // once without a reload, so step progress is never lost.
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [languageDone, setLanguageDone] = useState(!showLanguageStep);
  const [languageSaving, setLanguageSaving] = useState(false);
  const [languageError, setLanguageError] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [done, setDone] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const step = STEPS[stepIndex];
  const stepFields = SERVICE_FIELDS[step];
  // Same computation as AdminSettingsPanel: an env-sourced field is locked
  // (editing it here would be a silent no-op, see applyServiceSettings), and
  // any already-configured field gets the "already configured" hint instead
  // of an empty box — e.g. when .env already sets SMTP_* during an upgrade
  // but Plex/Tautulli/etc are still unset.
  const disabledKeys = new Set(stepFields.filter((f) => sources[f.envKey] === 'env').map((f) => f.envKey));
  const configuredKeys = new Set(stepFields.filter((f) => sources[f.envKey] !== 'unset').map((f) => f.envKey));

  async function handleStepSubmit(values: Record<string, string>): Promise<{ ok: boolean; error: string | null }> {
    const res = await fetch('/api/setup/step', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ service: step, values }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string; errorKey?: string; errorVars?: Record<string, string | number> };
    if (!res.ok || !data.ok) {
      return { ok: false, error: resolveStepError(locale, data) };
    }
    if (stepIndex === STEPS.length - 1) {
      await completeSetup();
    } else {
      setStepIndex(stepIndex + 1);
    }
    return { ok: true, error: null };
  }

  async function completeSetup() {
    setCompleting(true);
    setCompleteError(null);
    const res = await fetch('/api/setup/complete', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await res.json()) as { ok?: boolean; error?: string; errorKey?: string; errorVars?: Record<string, string | number> };
    if (!res.ok || !data.ok) {
      setCompleteError(resolveStepError(locale, data));
      setCompleting(false);
      return;
    }
    setDone(true);
  }

  async function saveLanguage(next: Locale): Promise<boolean> {
    setLanguageSaving(true);
    setLanguageError(false);
    try {
      const res = await fetch('/api/setup/locale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ locale: next }),
      });
      if (!res.ok) {
        setLanguageError(true);
        return false;
      }
      setLocale(next);
      return true;
    } catch {
      setLanguageError(true);
      return false;
    } finally {
      setLanguageSaving(false);
    }
  }

  if (!languageDone) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 p-6">
        <h1 className="font-display text-2xl text-plexcrew-screen">{t(locale, 'setup.languageTitle')}</h1>
        <p className="text-sm text-plexcrew-ash">{t(locale, 'setup.languageHint')}</p>
        <div className="flex items-center gap-2 text-sm">
          {LOCALES.map((l) => (
            <button
              key={l}
              type="button"
              disabled={languageSaving}
              onClick={() => void saveLanguage(l)}
              aria-pressed={locale === l}
              className={
                locale === l
                  ? 'rounded bg-plexcrew-amber px-4 py-2 font-semibold text-plexcrew-ink'
                  : 'rounded px-4 py-2 text-plexcrew-ash hover:text-plexcrew-screen'
              }
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
        <div>
          <button
            type="button"
            disabled={languageSaving}
            onClick={async () => {
              if (await saveLanguage(locale)) setLanguageDone(true);
            }}
            className="rounded-full bg-plexcrew-teal px-4 py-2 text-sm font-semibold text-plexcrew-ink disabled:opacity-50"
          >
            {t(locale, 'setup.languageContinue')}
          </button>
        </div>
        {languageError && <p className="text-sm text-plexcrew-amber">{t(locale, 'setup.languageError')}</p>}
      </main>
    );
  }

  if (done) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="font-display text-2xl text-plexcrew-screen">{t(locale, 'setup.done')}</h1>
        <a href="/login" className="text-plexcrew-teal underline">
          {t(locale, 'setup.goToLogin')}
        </a>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-plexcrew-screen">{t(locale, `setup.steps.${step}`)}</h1>
        <span className="text-xs text-plexcrew-ash">
          {stepIndex + 1} / {STEPS.length}
        </span>
      </div>
      {/* key={step} forces a full remount on every step change — ServiceSettingsForm
          seeds its `values` state via useState's lazy initializer, which only runs
          once per mount. Without a fresh instance per step, stale values from the
          previous step's fields would leak into (or be missing for) the new step. */}
      <ServiceSettingsForm
        key={step}
        locale={locale}
        fields={stepFields}
        testable={step !== 'publicBaseUrl' && step !== 'jellyfinActivitySource'}
        disabledKeys={disabledKeys}
        configuredKeys={configuredKeys}
        onSubmit={handleStepSubmit}
        onSkip={
          step === 'plex' || step === 'tautulli' || step === 'jellyfin' || step === 'jellystat'
            ? () => setStepIndex(stepIndex + 1)
            : undefined
        }
      />
      {completing && <p className="text-sm text-plexcrew-ash">{t(locale, 'setup.finalizing')}</p>}
      {completeError && <p className="text-sm text-plexcrew-amber">{completeError}</p>}
    </main>
  );
}
