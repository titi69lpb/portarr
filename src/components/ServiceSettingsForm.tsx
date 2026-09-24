'use client';

import { useState, type FormEvent } from 'react';
import { fieldLabel, optionLabel, type FieldDef } from '@/lib/settings-schema';
import type { Locale } from '@/lib/i18n/dictionaries';
import { t } from '@/lib/i18n/translate';

export interface ServiceSettingsFormProps {
  locale: Locale;
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
  // When set, a "Skip this step" button appears next to submit — for an
  // optional service (Jellyfin, Jellystat, and — since Plex/Tautulli became optional as a pair — Plex and Tautulli too)
  // whose step can be skipped without saving anything.
  onSkip?: () => void;
}

export function ServiceSettingsForm({
  locale,
  fields,
  testable,
  onSubmit,
  initialValues,
  configuredKeys,
  disabledKeys,
  onSkip,
}: ServiceSettingsFormProps) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(
      fields.map((f) => [
        f.envKey,
        f.type === 'text' || f.type === 'select' ? initialValues?.[f.envKey] ?? (f.type === 'select' ? f.options![0].value : '') : '',
      ])
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
      setError(t(locale, 'settings.errors.network'));
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
            {fieldLabel(locale, field)}
            {field.type === 'select' ? (
              <select
                value={values[field.envKey]}
                onChange={(e) => setValues({ ...values, [field.envKey]: e.target.value })}
                className="rounded-md border border-plexcrew-teal/20 bg-plexcrew-charcoal/60 px-3 py-2 text-plexcrew-screen"
              >
                {field.options!.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {optionLabel(locale, opt)}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={field.type === 'password' ? 'password' : 'text'}
                disabled={disabled}
                value={values[field.envKey]}
                placeholder={
                  disabled
                    ? t(locale, 'settings.envPlaceholder')
                    : alreadyConfigured
                      ? t(locale, 'settings.keepPlaceholder')
                      : undefined
                }
                onChange={(e) => setValues({ ...values, [field.envKey]: e.target.value })}
                className="rounded-md border border-plexcrew-teal/20 bg-plexcrew-charcoal/60 px-3 py-2 text-plexcrew-screen disabled:opacity-50"
              />
            )}
          </label>
        );
      })}
      {error && <p className="text-sm text-plexcrew-amber">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-plexcrew-teal px-4 py-2 text-sm font-semibold text-plexcrew-ink disabled:opacity-50"
        >
          {submitting
            ? t(locale, testable ? 'settings.testing' : 'settings.saving')
            : t(locale, testable ? 'settings.testAndSave' : 'settings.save')}
        </button>
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            disabled={submitting}
            className="rounded-full border border-plexcrew-teal/30 px-4 py-2 text-sm font-medium text-plexcrew-screen disabled:opacity-50"
          >
            {t(locale, 'settings.skip')}
          </button>
        )}
      </div>
    </form>
  );
}
