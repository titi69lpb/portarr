import { NextRequest, NextResponse } from 'next/server';
import { verifySession, SESSION_COOKIE_NAME } from '@/lib/session';
import { secureCompare } from '@/lib/secure-compare';
import { loadConfig } from '@/lib/config';
import { getDb } from '@/lib/db';
import { getNewsletterItems } from '@/lib/newsletter';
import { renderNewsletterHtml } from '@/lib/newsletter-template';
import { isSubscribed } from '@/lib/newsletter-subscriptions';
import { createTransport, sendMail } from '@/lib/mailer';
import { insertMailLog } from '@/lib/mail-log';
import { signUnsubscribeToken } from '@/lib/newsletter-token';
import { insertNewsletterArchive } from '@/lib/newsletter-archive';

export const dynamic = 'force-dynamic';

const WINDOW_DAYS = 6;

interface UserRow {
  plex_id: string;
  email: string;
  username: string;
}

export async function POST(request: NextRequest) {
  try {
    const config = loadConfig();

    const secretHeader = request.headers.get('x-newsletter-secret');
    const hasValidSecret = !!secretHeader && secureCompare(secretHeader, config.newsletterCronSecret);

    if (!hasValidSecret) {
      const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
      const sessionUser = token ? await verifySession(token, config.session.secret) : null;
      if (!sessionUser) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
      }
      if (!sessionUser.isOwner) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 });
      }
    }

    const items = await getNewsletterItems(config.plex.url, config.plex.serverToken, WINDOW_DAYS);
    if (items.movies.length === 0 && items.episodes.length === 0) {
      return NextResponse.json({ sent: 0, failed: 0, total: 0, skipped: true });
    }

    const endDate = new Date().toLocaleDateString('fr-FR');
    const posterBaseUrl = `${config.publicBaseUrl}/api/newsletter/poster`;
    const subject = `Les Nouveautés ${config.plex.serverName}! (${endDate})`;
    const templateName = `Newsletter ${endDate}`;

    const db = getDb();
    const allUsers = db
      .prepare('SELECT plex_id, email, username FROM users WHERE email != \'\'')
      .all() as UserRow[];
    const recipients = allUsers.filter((u) => isSubscribed(db, u.plex_id));

    // Archive a copy before sending — its unsubscribe link points at the
    // dashboard (no per-recipient token makes sense for a copy anyone can
    // view), and it never gets its own "view in browser" link.
    const archiveHtml = renderNewsletterHtml(
      items,
      config.plex.serverName,
      endDate,
      posterBaseUrl,
      `${config.publicBaseUrl}/`,
      config.publicBaseUrl
    );
    const archive = insertNewsletterArchive(db, { subject, html: archiveHtml });
    const archiveUrl = `${config.publicBaseUrl}/api/newsletter/archive/${archive.id}`;

    const transport = createTransport(config.smtp);
    const from = `"${config.smtp.fromName}" <${config.smtp.fromAddress}>`;

    let sent = 0;
    let failed = 0;
    for (const recipient of recipients) {
      const unsubscribeToken = await signUnsubscribeToken(recipient.plex_id, config.session.secret);
      const unsubscribeUrl = `${config.publicBaseUrl}/api/newsletter/unsubscribe?token=${unsubscribeToken}`;
      const html = renderNewsletterHtml(
        items,
        config.plex.serverName,
        endDate,
        posterBaseUrl,
        unsubscribeUrl,
        config.publicBaseUrl,
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
