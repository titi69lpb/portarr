import { NextRequest, NextResponse } from 'next/server';
import { loadConfig } from '@/lib/config';
import { getDb } from '@/lib/db';
import { getAvailableRequests } from '@/lib/overseerr';
import { hasBeenNotified, markNotified } from '@/lib/request-notifications';
import { createTransport, sendMail } from '@/lib/mailer';
import { renderEmailShell } from '@/lib/email-template';
import { renderMarkdown } from '@/lib/markdown';
import { insertMailLog } from '@/lib/mail-log';
import { secureCompare } from '@/lib/secure-compare';

export const dynamic = 'force-dynamic';

// Caps how many notifications one cron run will send. This portal's library
// has previously lost ~10TB of media to a NAS failure (see the dashboard's
// own incident announcement) and is being restored gradually — as batches of
// previously-deleted requests come back online, dozens could flip to
// "available" within the same 15-minute window. Each is still genuinely
// newly-available and still gets exactly one email eventually (the rest wait
// for the next run, since only successfully-sent items are marked notified),
// but this spreads a restoration burst across several runs instead of
// flooding one inbox with 30+ emails in the same few seconds.
const MAX_NOTIFICATIONS_PER_RUN = 5;

// Reuses the same shared secret as the newsletter cron route (env var
// NEWSLETTER_CRON_SECRET) — both are scheduled jobs hitting an otherwise
// unauthenticated endpoint, and adding a second production secret just for
// this job wasn't worth the extra deploy step.
export async function POST(request: NextRequest) {
  try {
    const config = loadConfig();
    const secretHeader = request.headers.get('x-cron-secret');
    if (!secretHeader || !secureCompare(secretHeader, config.newsletterCronSecret)) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const db = getDb();
    const available = await getAvailableRequests(config.overseerr.url, config.overseerr.apiKey);
    const pending = available.filter((r) => !hasBeenNotified(db, r.requestId));
    const toNotify = pending.slice(0, MAX_NOTIFICATIONS_PER_RUN);

    if (toNotify.length === 0) {
      return NextResponse.json({ notified: 0, total: 0, deferredToNextRun: 0 });
    }

    const transport = createTransport(config.smtp);
    const from = `"${config.smtp.fromName}" <${config.smtp.fromAddress}>`;

    let notified = 0;
    for (const item of toNotify) {
      if (!item.requesterEmail) {
        // No email on file for this requester — nothing we can do, and
        // retrying forever would just re-fetch the same dead end every run.
        markNotified(db, item.requestId);
        continue;
      }

      const subject = `${item.title} est maintenant disponible !`;
      const markdownBody = `# ${item.title} est disponible !\n\nBonjour ${item.requesterUsername},\n\nVotre demande **${item.title}** est maintenant disponible sur ${config.plex.serverName}. Bon visionnage !`;
      const html = renderEmailShell(renderMarkdown(markdownBody), config.publicBaseUrl);

      try {
        await sendMail(transport, from, item.requesterEmail, subject, html);
        insertMailLog(db, {
          templateId: null,
          templateName: 'Demande disponible',
          recipientEmail: item.requesterEmail,
          recipientUsername: item.requesterUsername,
          status: 'sent',
        });
        markNotified(db, item.requestId);
        notified += 1;
      } catch (err) {
        console.error(`Failed to send availability notification for request ${item.requestId}:`, err);
        insertMailLog(db, {
          templateId: null,
          templateName: 'Demande disponible',
          recipientEmail: item.requesterEmail,
          recipientUsername: item.requesterUsername,
          status: 'failed',
        });
        // Not marked notified — retried on the next run.
      }
    }

    return NextResponse.json({
      notified,
      total: toNotify.length,
      deferredToNextRun: pending.length - toNotify.length,
    });
  } catch (err) {
    console.error('Failed to check request availability:', err);
    return NextResponse.json({ error: 'Failed to check request availability' }, { status: 502 });
  }
}
