import type { MailLogEntry } from '@/lib/mail-log';

export function AdminMailHistory({ entries }: { entries: MailLogEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-plexcrew-ash">Aucun envoi pour le moment.</p>;
  }

  return (
    <div className="pc-glass-surface overflow-x-auto rounded-lg p-4 ring-1 ring-plexcrew-teal/20">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-plexcrew-teal/20 text-xs font-semibold uppercase tracking-wider text-plexcrew-ash">
            <th className="py-2 pr-4">Destinataire</th>
            <th className="py-2 pr-4">Modèle</th>
            <th className="py-2 pr-4">Statut</th>
            <th className="py-2 font-mono">Date</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-b border-plexcrew-teal/10 last:border-0">
              <td className="py-2 pr-4 text-plexcrew-screen">
                {e.recipientUsername ?? e.recipientEmail}
              </td>
              <td className="py-2 pr-4 text-plexcrew-screen">{e.templateName}</td>
              <td className="py-2 pr-4 text-plexcrew-screen">{e.status}</td>
              <td className="py-2 font-mono text-xs text-plexcrew-ash">
                {new Date(e.sentAt).toLocaleString('fr-FR')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
