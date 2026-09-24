'use client';

import { useState } from 'react';
import { ServiceSettingsForm } from './ServiceSettingsForm';
import { SERVICE_FIELDS, type ServiceKey } from '@/lib/settings-schema';
import type { ConfigSource } from '@/lib/config';
import type { Locale } from '@/lib/i18n/dictionaries';
import { t } from '@/lib/i18n/translate';
import { resolveStepError } from '@/lib/settings-error';

const SERVICES: ServiceKey[] = ['publicBaseUrl', 'plex', 'tautulli', 'jellyfin', 'jellystat', 'jellyfinActivitySource', 'sonarr', 'radarr', 'overseerr', 'smtp'];

export function AdminSettingsPanel({
  sources,
  initialValues,
  locale,
}: {
  sources: Record<string, ConfigSource>;
  initialValues: Record<string, string>;
  locale: Locale;
}) {
  const [savedNotice, setSavedNotice] = useState<ServiceKey | null>(null);

  async function handleSubmit(service: ServiceKey, values: Record<string, string>) {
    const res = await fetch('/api/admin/settings/step', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service, values }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string; errorKey?: string; errorVars?: Record<string, string | number> };
    if (!res.ok || !data.ok) {
      return { ok: false as const, error: resolveStepError(locale, data) };
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
            <h2 className="mb-3 font-display text-xl text-plexcrew-screen">{t(locale, `settings.services.${service}`)}</h2>
            <ServiceSettingsForm
              locale={locale}
              fields={fields}
              testable={service !== 'publicBaseUrl' && service !== 'jellyfinActivitySource'}
              disabledKeys={disabledKeys}
              configuredKeys={configuredKeys}
              initialValues={initialValues}
              onSubmit={(values) => handleSubmit(service, values)}
            />
            {savedNotice === service && <p className="mt-2 text-sm text-plexcrew-teal">{t(locale, 'settings.saved')}</p>}
          </section>
        );
      })}
    </div>
  );
}
