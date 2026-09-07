'use client';

import { useState, type FormEvent } from 'react';

export function AdminAnnouncementForm() {
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (content.trim() === '') return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentMarkdown: content }),
      });
      if (!res.ok) {
        setError("Échec de la création de l'annonce");
        return;
      }
      window.location.reload();
    } catch {
      setError("Échec de la création de l'annonce");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="pc-glass-surface space-y-3 rounded-lg p-5 ring-1 ring-plexcrew-teal/20"
    >
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Nouvelle annonce (Markdown)"
        rows={4}
        className="w-full rounded-md border border-plexcrew-teal/30 bg-plexcrew-ink p-3 font-mono text-sm leading-relaxed text-plexcrew-screen placeholder:text-plexcrew-ash focus:border-plexcrew-teal"
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-plexcrew-amber px-4 py-2 text-sm font-semibold text-plexcrew-ink transition-colors hover:bg-plexcrew-amber/90 disabled:opacity-50"
      >
        Publier
      </button>
    </form>
  );
}
