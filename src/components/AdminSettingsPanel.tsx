'use client';

import { useState } from 'react';
import { ServiceSettingsForm } from './ServiceSettingsForm';
import { SERVICE_FIELDS, type ServiceKey } from '@/lib/settings-schema';
import type { ConfigSource } from '@/lib/config';

const SERVICE_TITLES: Record<ServiceKey, string> = {
  publicBaseUrl: 'URL publique',
  plex: 'Plex',
  tautulli: 'Tautulli',
  sonarr: 'Sonarr',
  radarr: 'Radarr',
  overseerr: 'Overseerr',
  smtp: 'SMTP',
};

const SERVICES: ServiceKey[] = ['publicBaseUrl', 'plex', 'tautulli', 'sonarr', 'radarr', 'overseerr', 'smtp'];

export function AdminSettingsPanel({
  sources,
  initialValues,
}: {
  sources: Record<string, ConfigSource>;
  initialValues: Record<string, string>;
}) {
  const [savedNotice, setSavedNotice] = useState<ServiceKey | null>(null);

  async function handleSubmit(service: ServiceKey, values: Record<string, string>) {
    const res = await fetch('/api/admin/settings/step', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service, values }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      return { ok: false as const, error: data.error ?? 'Erreur inconnue' };
    }
    setSavedNotice(service);
    return { ok: true as const, error: null };
  }

  return (
    <div className="space-y-8">
      {SERVICES.map((service) => {
        const fields = SERVICE_FIELDS[service];
        const disabledKeys = new Set(fields.filter((f) => sources[f.envKey] === 'env').map((f) => f.envKey));
        const configuredKeys = new Set(fields.filter((f) => sources[f.envKey] !== 'unset').map((f) => f.envKey));
        return (
          <section key={service} className="pc-glass-surface rounded-lg p-5 ring-1 ring-plexcrew-teal/15">
            <h2 className="mb-3 font-display text-xl text-plexcrew-screen">{SERVICE_TITLES[service]}</h2>
            <ServiceSettingsForm
              fields={fields}
              testable={service !== 'publicBaseUrl'}
              disabledKeys={disabledKeys}
              configuredKeys={configuredKeys}
              initialValues={initialValues}
              onSubmit={(values) => handleSubmit(service, values)}
            />
            {savedNotice === service && <p className="mt-2 text-sm text-plexcrew-teal">Enregistré.</p>}
          </section>
        );
      })}
    </div>
  );
}
