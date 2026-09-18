'use client';

import { useState, type FormEvent } from 'react';
import type { FieldDef } from '@/lib/settings-schema';

export interface ServiceSettingsFormProps {
  fields: FieldDef[];
  testable: boolean;
  onSubmit: (values: Record<string, string>) => Promise<{ ok: boolean; error: string | null }>;
  // Pre-fills text fields (URLs, names) on /admin/settings. Never used for
  // password-type fields — those start blank; see configuredKeys below.
  initialValues?: Record<string, string>;
  // Password fields already backed by a real value (env or DB) render a
  // "already configured" hint instead of the real secret, and submitting
  // blank keeps that value unchanged (applyServiceSettings handles the fallback).
  configuredKeys?: Set<string>;
  // Fields currently sourced from an env var — always env-priority, editing
  // them here would silently have no effect, so they're locked instead.
  disabledKeys?: Set<string>;
}

export function ServiceSettingsForm({
  fields,
  testable,
  onSubmit,
  initialValues,
  configuredKeys,
  disabledKeys,
}: ServiceSettingsFormProps) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(
      fields.map((f) => [f.envKey, f.type === 'text' ? initialValues?.[f.envKey] ?? '' : ''])
    )
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await onSubmit(values);
      if (!result.ok) setError(result.error);
    } catch (err) {
      setError('Erreur réseau inconnue');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {fields.map((field) => {
        const disabled = disabledKeys?.has(field.envKey) ?? false;
        const alreadyConfigured = field.type === 'password' && (configuredKeys?.has(field.envKey) ?? false);
        return (
          <label key={field.envKey} className="flex flex-col gap-1 text-sm text-plexcrew-ash">
            {field.label}
            <input
              type={field.type === 'password' ? 'password' : 'text'}
              disabled={disabled}
              value={values[field.envKey]}
              placeholder={
                disabled
                  ? "Défini via variable d'environnement"
                  : alreadyConfigured
                    ? '•••••••• (laisser vide pour ne pas changer)'
                    : undefined
              }
              onChange={(e) => setValues({ ...values, [field.envKey]: e.target.value })}
              className="rounded-md border border-plexcrew-teal/20 bg-plexcrew-charcoal/60 px-3 py-2 text-plexcrew-screen disabled:opacity-50"
            />
          </label>
        );
      })}
      {error && <p className="text-sm text-plexcrew-amber">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-full bg-plexcrew-teal px-4 py-2 text-sm font-semibold text-plexcrew-ink disabled:opacity-50"
      >
        {submitting ? (testable ? 'Test en cours…' : 'Enregistrement…') : testable ? 'Tester et enregistrer' : 'Enregistrer'}
      </button>
    </form>
  );
}
