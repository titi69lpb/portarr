import type { MemberOverview } from '@/lib/members';
import { providerLabel } from '@/lib/media/labels';
import { dictionaries, type Locale } from '@/lib/i18n/dictionaries';
import { t } from '@/lib/i18n/translate';

function formatDate(iso: string | null, localeCode: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(localeCode);
}

export function AdminMembersList({ members, locale }: { members: MemberOverview[]; locale: Locale }) {
  if (members.length === 0) {
    return <p className="text-sm text-plexcrew-ash">{t(locale, 'admin.noMembers')}</p>;
  }

  const localeCode = dictionaries[locale].admin.localeCode;

  return (
    <div className="pc-glass-surface overflow-x-auto rounded-lg p-4 ring-1 ring-plexcrew-teal/20">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-plexcrew-teal/20 text-xs font-semibold uppercase tracking-wider text-plexcrew-ash">
            <th className="py-2 pr-4">{t(locale, 'admin.memberCol')}</th>
            <th className="py-2 pr-4">{t(locale, 'admin.portalLastLoginCol')}</th>
            <th className="py-2 pr-4">{t(locale, 'admin.tautulliLastSeenCol')}</th>
            <th className="py-2">{t(locale, 'admin.newsletterCol')}</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={`${m.provider}:${m.userId}`} className="border-b border-plexcrew-teal/10 last:border-0">
              <td className="py-2 pr-4 text-plexcrew-screen">
                {m.username}
                <span className="ml-2 rounded border border-plexcrew-teal/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-plexcrew-ash">
                  {providerLabel(m.provider)}
                </span>
                <span className="ml-2 text-xs text-plexcrew-ash">{m.email}</span>
              </td>
              <td className="py-2 pr-4 font-mono text-xs text-plexcrew-ash">
                {formatDate(m.portalLastLogin, localeCode)}
              </td>
              <td className="py-2 pr-4 font-mono text-xs text-plexcrew-ash">
                {formatDate(m.lastSeen, localeCode)}
              </td>
              <td className="py-2 text-xs">
                {m.newsletterOptedIn ? (
                  <span className="text-plexcrew-teal">{t(locale, 'admin.subscribed')}</span>
                ) : (
                  <span className="text-plexcrew-ash">{t(locale, 'admin.unsubscribed')}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
