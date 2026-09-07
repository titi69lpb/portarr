import { NextRequest, NextResponse } from 'next/server';
import { loadConfig } from '@/lib/config';
import { getDb } from '@/lib/db';
import { getMailTemplate } from '@/lib/mail-templates';
import { hashContent } from '@/lib/mail-guard';
import { renderMarkdown } from '@/lib/markdown';
import { renderEmailShell } from '@/lib/email-template';
import { createTransport, sendMail } from '@/lib/mailer';
import { insertMailLog } from '@/lib/mail-log';
import { resolveRecipients, defaultRecipientDeps, type RecipientParams } from '@/lib/mail-recipients';
import { requireOwner } from '@/lib/route-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const denied = await requireOwner(request);
    if (denied) return denied;

    const config = loadConfig();
    const body = await request.json();
    const db = getDb();
    const template = getMailTemplate(db, Number(body.templateId));
    if (!template) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }

    const currentHash = hashContent(template.subject, template.bodyMarkdown);
    if (body.testedHash !== currentHash) {
      return NextResponse.json(
        { error: 'Content has changed since the last test — please retest before sending.' },
        { status: 403 }
      );
    }

    const target = body.target as RecipientParams;
    const recipients = await resolveRecipients(db, target, defaultRecipientDeps, {
      url: config.tautulli.url,
      apiKey: config.tautulli.apiKey,
    });

    const transport = createTransport(config.smtp);
    const from = `"${config.smtp.fromName}" <${config.smtp.fromAddress}>`;
    const html = renderEmailShell(renderMarkdown(template.bodyMarkdown), config.publicBaseUrl);

    let sent = 0;
    let failed = 0;
    for (const recipient of recipients) {
      try {
        await sendMail(transport, from, recipient.email, template.subject, html);
        insertMailLog(db, {
          templateId: template.id,
          templateName: template.name,
          recipientEmail: recipient.email,
          recipientUsername: recipient.username,
          status: 'sent',
        });
        sent += 1;
      } catch (err) {
        console.error(`Failed to send to ${recipient.email}:`, err);
        insertMailLog(db, {
          templateId: template.id,
          templateName: template.name,
          recipientEmail: recipient.email,
          recipientUsername: recipient.username,
          status: 'failed',
        });
        failed += 1;
      }
    }

    return NextResponse.json({ sent, failed, total: recipients.length });
  } catch (err) {
    console.error('Failed to send mail:', err);
    return NextResponse.json({ error: 'Failed to send mail' }, { status: 502 });
  }
}
