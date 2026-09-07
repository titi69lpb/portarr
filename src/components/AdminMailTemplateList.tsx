'use client';

import { useState, type FormEvent } from 'react';
import type { MailTemplate } from '@/lib/mail-templates';
import { AdminMailComposer, type MemberOption } from './AdminMailComposer';

type ActiveAction = 'send' | 'edit' | null;

function EditTemplateForm({ template }: { template: MailTemplate }) {
  const [name, setName] = useState(template.name);
  const [subject, setSubject] = useState(template.subject);
  const [bodyMarkdown, setBodyMarkdown] = useState(template.bodyMarkdown);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !subject.trim() || !bodyMarkdown.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/mail-templates/${template.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, subject, bodyMarkdown }),
      });
      if (!res.ok) {
        setError('Échec de la mise à jour du modèle');
        return;
      }
      window.location.reload();
    } catch {
      setError('Échec de la mise à jour du modèle');
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
        Enregistrer les modifications
      </button>
    </form>
  );
}

export function AdminMailTemplateList({
  templates,
  members = [],
}: {
  templates: MailTemplate[];
  members?: MemberOption[];
}) {
  const [activeId, setActiveId] = useState<number | null>(null);
  const [activeAction, setActiveAction] = useState<ActiveAction>(null);
  const [error, setError] = useState<string | null>(null);

  function toggleAction(id: number, action: Exclude<ActiveAction, null>) {
    if (activeId === id && activeAction === action) {
      setActiveId(null);
      setActiveAction(null);
    } else {
      setActiveId(id);
      setActiveAction(action);
    }
  }

  async function remove(id: number) {
    try {
      const res = await fetch(`/api/admin/mail-templates/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        setError('Échec de la suppression du modèle');
        return;
      }
      window.location.reload();
    } catch {
      setError('Échec de la suppression du modèle');
    }
  }

  if (templates.length === 0) {
    return <p className="text-sm text-plexcrew-ash">Aucun modèle pour le moment.</p>;
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-400">{error}</p>}
      <ul className="space-y-2">
        {templates.map((t) => {
          const isActive = activeId === t.id;
          return (
            <li
              key={t.id}
              className="pc-glass-surface flex flex-col gap-3 rounded-lg p-4 text-sm ring-1 ring-plexcrew-teal/20"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-plexcrew-screen">
                  <strong>{t.name}</strong> — {t.subject}
                </span>
                <span className="flex flex-none gap-4">
                  <button
                    onClick={() => toggleAction(t.id, 'send')}
                    className="rounded font-medium text-plexcrew-ash transition-colors hover:text-plexcrew-screen"
                  >
                    {isActive && activeAction === 'send' ? 'Fermer' : 'Envoyer'}
                  </button>
                  <button
                    onClick={() => toggleAction(t.id, 'edit')}
                    className="rounded font-medium text-plexcrew-ash transition-colors hover:text-plexcrew-screen"
                  >
                    {isActive && activeAction === 'edit' ? 'Fermer' : 'Editer'}
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm('Supprimer ce modèle ? Cette action est irréversible.')) {
                        remove(t.id);
                      }
                    }}
                    className="rounded font-medium text-red-400 transition-colors hover:text-red-300"
                  >
                    Supprimer
                  </button>
                </span>
              </div>
              {isActive && activeAction === 'send' && (
                <div className="border-t border-plexcrew-teal/20 pt-3">
                  <AdminMailComposer template={t} members={members} />
                </div>
              )}
              {isActive && activeAction === 'edit' && (
                <div className="border-t border-plexcrew-teal/20 pt-3">
                  <EditTemplateForm template={t} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
