'use client';

import { useState } from 'react';
import { ServiceSettingsForm } from './ServiceSettingsForm';
import { SERVICE_FIELDS, type ServiceKey } from '@/lib/settings-schema';
import type { ConfigSource } from '@/lib/config';

const STEPS: ServiceKey[] = ['publicBaseUrl', 'plex', 'tautulli', 'jellyfin', 'sonarr', 'radarr', 'overseerr', 'smtp'];

const STEP_TITLES: Record<ServiceKey, string> = {
  publicBaseUrl: 'URL publique',
  plex: 'Plex',
  tautulli: 'Tautulli',
  jellyfin: 'Jellyfin (optionnel)',
  sonarr: 'Sonarr',
  radarr: 'Radarr',
  overseerr: 'Overseerr',
  smtp: 'SMTP',
};

export function SetupWizard({ token, sources }: { token: string; sources: Record<string, ConfigSource> }) {
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
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error ?? 'Erreur inconnue' };
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
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      setCompleteError(data.error ?? 'Erreur inconnue');
      setCompleting(false);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="font-display text-2xl text-plexcrew-screen">Configuration terminée</h1>
        <a href="/login" className="text-plexcrew-teal underline">
          Aller à la connexion →
        </a>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-plexcrew-screen">{STEP_TITLES[step]}</h1>
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
        fields={stepFields}
        testable={step !== 'publicBaseUrl'}
        disabledKeys={disabledKeys}
        configuredKeys={configuredKeys}
        onSubmit={handleStepSubmit}
        onSkip={step === 'jellyfin' ? () => setStepIndex(stepIndex + 1) : undefined}
      />
      {completing && <p className="text-sm text-plexcrew-ash">Finalisation…</p>}
      {completeError && <p className="text-sm text-plexcrew-amber">{completeError}</p>}
    </main>
  );
}
