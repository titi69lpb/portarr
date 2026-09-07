'use client';

import { useState, useEffect } from 'react';
import type { MailTemplate } from '@/lib/mail-templates';
import type { RecipientParams } from '@/lib/mail-recipients';

type TargetChoice = 'broadcast' | 'activeSince' | 'neverActive' | 'individual';

export interface MemberOption {
  email: string;
  username: string;
}

export function AdminMailComposer({
  template,
  members = [],
}: {
  template: MailTemplate;
  members?: MemberOption[];
}) {
  const [targetChoice, setTargetChoice] = useState<TargetChoice>('broadcast');
  const [activeSinceDays, setActiveSinceDays] = useState(30);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [memberFilter, setMemberFilter] = useState('');
  const [testedHash, setTestedHash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/mail-templates/${template.id}/preview`)
      .then((res) => (res.ok ? res.json() : { html: '' }))
      .then((body) => {
        if (!cancelled) setPreviewHtml(body.html ?? '');
      })
      .catch(() => {
        if (!cancelled) setPreviewHtml('');
      });
    return () => {
      cancelled = true;
    };
  }, [template.id, template.bodyMarkdown]);

  function buildTarget(): RecipientParams {
    if (targetChoice === 'broadcast') return { mode: 'broadcast' };
    if (targetChoice === 'activeSince') {
      return { mode: 'group', filter: { type: 'activeSince', days: activeSinceDays } };
    }
    if (targetChoice === 'neverActive') {
      return { mode: 'group', filter: { type: 'neverActive' } };
    }
    return {
      mode: 'individual',
      emails: Array.from(selectedEmails),
    };
  }

  function toggleMember(email: string) {
    setSelectedEmails((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  }

  const filteredMembers = members.filter((m) => {
    const q = memberFilter.trim().toLowerCase();
    if (!q) return true;
    return m.username.toLowerCase().includes(q) || m.email.toLowerCase().includes(q);
  });

  async function sendTest() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/mail/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: template.id }),
      });
      if (!res.ok) {
        setError("Échec de l'envoi du test");
        return;
      }
      const body = await res.json();
      setTestedHash(body.hash);
      setMessage('Test envoyé à votre adresse.');
    } catch {
      setError("Échec de l'envoi du test");
    } finally {
      setBusy(false);
    }
  }

  async function sendMass() {
    if (!testedHash) return;
    if (targetChoice === 'individual' && selectedEmails.size === 0) {
      setError('Sélectionnez au moins un membre.');
      return;
    }
    const targetLabel =
      targetChoice === 'broadcast'
        ? 'tout le monde'
        : targetChoice === 'activeSince'
          ? `les utilisateurs actifs depuis ${activeSinceDays} jours`
          : targetChoice === 'neverActive'
            ? 'les utilisateurs jamais actifs'
            : `${selectedEmails.size} membre(s) sélectionné(s)`;
    if (
      !window.confirm(`Envoyer cet email à ${targetLabel} ? Cette action ne peut pas être annulée.`)
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/mail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: template.id, testedHash, target: buildTarget() }),
      });
      if (!res.ok) {
        setError("Le contenu a changé depuis le test, ou l'envoi a échoué. Retestez.");
        setTestedHash(null);
        return;
      }
      const body = await res.json();
      setMessage(`Envoyé à ${body.sent}/${body.total} destinataires.`);
      setTestedHash(null);
    } catch {
      setError("Échec de l'envoi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div
        className="prose prose-invert prose-sm pc-prose max-w-none rounded-md border border-plexcrew-teal/30 bg-plexcrew-ink p-3"
        dangerouslySetInnerHTML={{ __html: previewHtml }}
      />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <select
          value={targetChoice}
          onChange={(e) => {
            setTargetChoice(e.target.value as TargetChoice);
          }}
          className="rounded-md border border-plexcrew-teal/30 bg-plexcrew-ink p-2 text-plexcrew-screen focus:border-plexcrew-teal"
        >
          <option value="broadcast">Tout le monde</option>
          <option value="activeSince">Actifs depuis N jours</option>
          <option value="neverActive">Jamais actifs</option>
          <option value="individual">Sélection individuelle</option>
        </select>
        {targetChoice === 'activeSince' && (
          <input
            type="number"
            value={activeSinceDays}
            onChange={(e) => setActiveSinceDays(Number(e.target.value))}
            className="w-20 rounded-md border border-plexcrew-teal/30 bg-plexcrew-ink p-2 text-plexcrew-screen focus:border-plexcrew-teal"
          />
        )}
      </div>
      {targetChoice === 'individual' && (
        <div className="space-y-2 rounded-md border border-plexcrew-teal/30 bg-plexcrew-ink p-3">
          <div className="flex items-center justify-between gap-3">
            <input
              value={memberFilter}
              onChange={(e) => setMemberFilter(e.target.value)}
              placeholder="Filtrer par nom ou email…"
              className="flex-1 rounded-md border border-plexcrew-teal/30 bg-plexcrew-ink p-2 text-sm text-plexcrew-screen placeholder:text-plexcrew-ash focus:border-plexcrew-teal"
            />
            <span className="whitespace-nowrap text-xs text-plexcrew-ash">
              {selectedEmails.size} sélectionné(s)
            </span>
          </div>
          {members.length === 0 ? (
            <p className="text-sm text-plexcrew-ash">
              Aucun membre connu. Synchronisez les utilisateurs Plex depuis la section Membres.
            </p>
          ) : (
            <ul className="max-h-48 space-y-1 overflow-y-auto">
              {filteredMembers.map((m) => (
                <li key={m.email}>
                  <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm text-plexcrew-screen hover:bg-plexcrew-teal/10">
                    <input
                      type="checkbox"
                      checked={selectedEmails.has(m.email)}
                      onChange={() => toggleMember(m.email)}
                      className="accent-plexcrew-amber"
                    />
                    <span className="truncate">
                      {m.username} <span className="text-plexcrew-ash">({m.email})</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="flex items-center gap-4">
        <button
          onClick={sendTest}
          disabled={busy}
          className="rounded-md border border-plexcrew-teal/30 px-4 py-2 text-sm font-medium text-plexcrew-screen transition-colors hover:border-plexcrew-teal disabled:opacity-50"
        >
          Envoyer un test
        </button>
        <button
          onClick={sendMass}
          disabled={
            busy || !testedHash || (targetChoice === 'individual' && selectedEmails.size === 0)
          }
          className="rounded-md bg-plexcrew-amber px-4 py-2 text-sm font-semibold text-plexcrew-ink transition-colors hover:bg-plexcrew-amber/90 disabled:opacity-50"
          title={testedHash ? undefined : 'Testez le contenu actuel avant envoi'}
        >
          Envoyer
        </button>
      </div>
      {message && <p className="text-sm text-plexcrew-screen">{message}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
