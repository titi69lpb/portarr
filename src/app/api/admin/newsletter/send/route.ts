import { NextRequest, NextResponse } from 'next/server';
import { verifySession, SESSION_COOKIE_NAME } from '@/lib/session';
import { secureCompare } from '@/lib/secure-compare';
import { loadConfig, isSetupComplete, assertConfigured } from '@/lib/config';
import { getDb } from '@/lib/db';
import { getNewsletterItems } from '@/lib/newsletter';
import { renderNewsletterHtml } from '@/lib/newsletter-template';
import { isSubscribed } from '@/lib/newsletter-subscriptions';
import { createTransport, sendMail } from '@/lib/mailer';
import { insertMailLog } from '@/lib/mail-log';
import { signUnsubscribeToken } from '@/lib/newsletter-token';
import { insertNewsletterArchive } from '@/lib/newsletter-archive';
import { pickNewsletterRecipients, type NewsletterRow } from '@/lib/newsletter-recipients';
import { getActiveProviders } from '@/lib/media/registry';
import { getInstanceLocale, getLocaleByIdentity } from '@/lib/i18n/locale';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { t } from '@/lib/i18n/translate';

export const dynamic = 'force-dynamic';

const WINDOW_DAYS = 6;

export async function POST(request: NextRequest) {
  try {
    const rawConfig = loadConfig(process.env, getDb());

    const secretHeader = request.headers.get('x-newsletter-secret');
    const hasValidSecret = !!secretHeader && secureCompare(secretHeader, rawConfig.newsletterCronSecret);

    if (!hasValidSecret) {
      const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
      const sessionUser = token ? await verifySession(token, rawConfig.session.secret) : null;
      if (!sessionUser) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
      }
      if (!sessionUser.isOwner) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 });
      }
    }

    // Reachable pre-setup: the secret-header path doesn't depend on Plex/SMTP
    // being configured at all, unlike the session path above.
    if (!isSetupComplete(rawConfig)) {
      return NextResponse.json({ error: 'setup_incomplete' }, { status: 503 });
    }
    const config = assertConfigured(rawConfig);

    const items = await getNewsletterItems(getActiveProviders(config), WINDOW_DAYS);
    if (items.movies.length === 0 && items.episodes.length === 0) {
      return NextResponse.json({ sent: 0, failed: 0, total: 0, skipped: true });
    }

    const db = getDb();
    // Instance default locale only for the mail_log label and the archive copy
    // (a shared "view in browser" page, not tied to one recipient); each sent
    // email below uses its recipient's own locale.
    const instanceLocale = getInstanceLocale(db);
    const instanceEndDate = new Date().toLocaleDateString(dictionaries[instanceLocale].email.localeCode);
    const posterBaseUrl = `${config.publicBaseUrl}/api/newsletter/poster`;
    const archiveSubject = t(instanceLocale, 'email.newsletterSubject', {
      server: config.communityName,
      date: instanceEndDate,
    });
    const templateName = `Newsletter ${instanceEndDate}`;

    const allUsers = db
      .prepare('SELECT provider, external_id, email, username FROM users WHERE email != \'\'')
      .all() as NewsletterRow[];
    const recipients = pickNewsletterRecipients(allUsers, (u) =>
      isSubscribed(db, { provider: u.provider, userId: u.external_id })
    );

    // Archive a copy before sending — its unsubscribe link points at the
    // dashboard (no per-recipient token makes sense for a copy anyone can
    // view), and it never gets its own "view in browser" link.
    const archiveHtml = renderNewsletterHtml(
      items,
      config.communityName,
      instanceEndDate,
      posterBaseUrl,
      `${config.publicBaseUrl}/`,
      config.publicBaseUrl,
      instanceLocale
    );
    const archive = insertNewsletterArchive(db, { subject: archiveSubject, html: archiveHtml });
    const archiveUrl = `${config.publicBaseUrl}/api/newsletter/archive/${archive.id}`;

    const transport = createTransport(config.smtp);
    const from = `"${config.smtp.fromName}" <${config.smtp.fromAddress}>`;

    let sent = 0;
    let failed = 0;
    for (const recipient of recipients) {
      const recipientLocale = getLocaleByIdentity(recipient.provider, recipient.external_id, db);
      const recipientEndDate = new Date().toLocaleDateString(dictionaries[recipientLocale].email.localeCode);
      const subject = t(recipientLocale, 'email.newsletterSubject', {
        server: config.communityName,
        date: recipientEndDate,
      });
      const unsubscribeToken = await signUnsubscribeToken({ provider: recipient.provider, userId: recipient.external_id }, config.session.secret);
      const unsubscribeUrl = `${config.publicBaseUrl}/api/newsletter/unsubscribe?token=${unsubscribeToken}`;
      const html = renderNewsletterHtml(
        items,
        config.communityName,
        recipientEndDate,
        posterBaseUrl,
        unsubscribeUrl,
        config.publicBaseUrl,
        recipientLocale,
        archiveUrl
      );
      try {
        await sendMail(transport, from, recipient.email, subject, html);
        insertMailLog(db, {
          templateId: null,
          templateName,
          recipientEmail: recipient.email,
          recipientUsername: recipient.username,
          status: 'sent',
        });
        sent += 1;
      } catch (err) {
        console.error(`Failed to send newsletter to ${recipient.email}:`, err);
        insertMailLog(db, {
          templateId: null,
          templateName,
          recipientEmail: recipient.email,
          recipientUsername: recipient.username,
          status: 'failed',
        });
        failed += 1;
      }
    }

    return NextResponse.json({ sent, failed, total: recipients.length, skipped: false });
  } catch (err) {
    console.error('Failed to send newsletter:', err);
    return NextResponse.json({ error: 'Failed to send newsletter' }, { status: 502 });
  }
}
