import type { MemberOverview } from '@/lib/members';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR');
}

export function AdminMembersList({ members }: { members: MemberOverview[] }) {
  if (members.length === 0) {
    return <p className="text-sm text-plexcrew-ash">Personne ne s'est encore connecté au portail.</p>;
  }

  return (
    <div className="pc-glass-surface overflow-x-auto rounded-lg p-4 ring-1 ring-plexcrew-teal/20">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-plexcrew-teal/20 text-xs font-semibold uppercase tracking-wider text-plexcrew-ash">
            <th className="py-2 pr-4">Membre</th>
            <th className="py-2 pr-4">Dernière connexion portail</th>
            <th className="py-2 pr-4">Dernière activité Plex</th>
            <th className="py-2">Newsletter</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.plexId} className="border-b border-plexcrew-teal/10 last:border-0">
              <td className="py-2 pr-4 text-plexcrew-screen">
                {m.username}
                <span className="ml-2 text-xs text-plexcrew-ash">{m.email}</span>
              </td>
              <td className="py-2 pr-4 font-mono text-xs text-plexcrew-ash">
                {formatDate(m.portalLastLogin)}
              </td>
              <td className="py-2 pr-4 font-mono text-xs text-plexcrew-ash">
                {formatDate(m.tautulliLastSeen)}
              </td>
              <td className="py-2 text-xs">
                {m.newsletterOptedIn ? (
                  <span className="text-plexcrew-teal">Abonné</span>
                ) : (
                  <span className="text-plexcrew-ash">Désabonné</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
