'use client';

import { useState, type FormEvent } from 'react';

export function AdminMailTemplateForm() {
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyMarkdown, setBodyMarkdown] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !subject.trim() || !bodyMarkdown.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/mail-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, subject, bodyMarkdown }),
      });
      if (!res.ok) {
        setError('Échec de la création du modèle');
        return;
      }
      window.location.reload();
    } catch {
      setError('Échec de la création du modèle');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="pc-glass-surface space-y-3 rounded-lg p-5 ring-1 ring-plexcrew-teal/20"
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nom du modèle"
        className="w-full rounded-md border border-plexcrew-teal/30 bg-plexcrew-ink p-3 text-sm text-plexcrew-screen placeholder:text-plexcrew-ash focus:border-plexcrew-teal"
      />
      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Sujet"
        className="w-full rounded-md border border-plexcrew-teal/30 bg-plexcrew-ink p-3 text-sm text-plexcrew-screen placeholder:text-plexcrew-ash focus:border-plexcrew-teal"
      />
      <textarea
        value={bodyMarkdown}
        onChange={(e) => setBodyMarkdown(e.target.value)}
        placeholder="Corps (Markdown)"
        rows={4}
        className="w-full rounded-md border border-plexcrew-teal/30 bg-plexcrew-ink p-3 font-mono text-sm leading-relaxed text-plexcrew-screen placeholder:text-plexcrew-ash focus:border-plexcrew-teal"
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-plexcrew-amber px-4 py-2 text-sm font-semibold text-plexcrew-ink transition-colors hover:bg-plexcrew-amber/90 disabled:opacity-50"
      >
        Créer le modèle
      </button>
    </form>
  );
}
