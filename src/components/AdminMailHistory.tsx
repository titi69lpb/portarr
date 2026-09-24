import type { MailLogEntry } from '@/lib/mail-log';
import { dictionaries, type Locale } from '@/lib/i18n/dictionaries';
import { t } from '@/lib/i18n/translate';

// mail_log.status is stored as the raw English 'sent'/'failed'/'test'
// literal — rendering it directly always showed the same English word
// regardless of locale (harmless in en, wrong in fr). Mapped through the
// dictionary here instead of translating the stored value itself.
function statusLabel(status: MailLogEntry['status'], locale: Locale): string {
  if (status === 'sent') return t(locale, 'admin.statusSent');
  if (status === 'failed') return t(locale, 'admin.statusFailed');
  return t(locale, 'admin.statusTest');
}

export function AdminMailHistory({ entries, locale }: { entries: MailLogEntry[]; locale: Locale }) {
  if (entries.length === 0) {
    return <p className="text-sm text-plexcrew-ash">{t(locale, 'admin.noSendHistory')}</p>;
  }

  const localeCode = dictionaries[locale].admin.localeCode;

  return (
    <div className="pc-glass-surface overflow-x-auto rounded-lg p-4 ring-1 ring-plexcrew-teal/20">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-plexcrew-teal/20 text-xs font-semibold uppercase tracking-wider text-plexcrew-ash">
            <th className="py-2 pr-4">{t(locale, 'admin.recipientCol')}</th>
            <th className="py-2 pr-4">{t(locale, 'admin.templateCol')}</th>
            <th className="py-2 pr-4">{t(locale, 'admin.statusCol')}</th>
            <th className="py-2 font-mono">{t(locale, 'admin.dateCol')}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-b border-plexcrew-teal/10 last:border-0">
              <td className="py-2 pr-4 text-plexcrew-screen">
                {e.recipientUsername ?? e.recipientEmail}
              </td>
              <td className="py-2 pr-4 text-plexcrew-screen">{e.templateName}</td>
              <td className="py-2 pr-4 text-plexcrew-screen">{statusLabel(e.status, locale)}</td>
              <td className="py-2 font-mono text-xs text-plexcrew-ash">
                {new Date(e.sentAt).toLocaleString(localeCode)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
