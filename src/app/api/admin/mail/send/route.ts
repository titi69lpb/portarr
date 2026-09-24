import { NextRequest, NextResponse } from 'next/server';
import { loadConfig, isSetupComplete, assertConfigured } from '@/lib/config';
import { getDb } from '@/lib/db';
import { getMailTemplate } from '@/lib/mail-templates';
import { hashContent } from '@/lib/mail-guard';
import { renderMarkdown } from '@/lib/markdown';
import { renderEmailShell } from '@/lib/email-template';
import { createTransport, sendMail } from '@/lib/mailer';
import { insertMailLog } from '@/lib/mail-log';
import { resolveRecipients, type RecipientParams } from '@/lib/mail-recipients';
import { getActivitySources } from '@/lib/activity/registry';
import { requireOwner } from '@/lib/route-auth';
import { getLocaleByEmail } from '@/lib/i18n/locale';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const denied = await requireOwner(request);
    if (denied) return denied;

    const rawConfig = loadConfig(process.env, getDb());
    if (!isSetupComplete(rawConfig)) {
      return NextResponse.json({ error: 'setup_incomplete' }, { status: 503 });
    }
    const config = assertConfigured(rawConfig);
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
    const recipients = await resolveRecipients(db, target, getActivitySources(config));

    const transport = createTransport(config.smtp);
    const from = `"${config.smtp.fromName}" <${config.smtp.fromAddress}>`;
    // The Markdown body is free text written by the admin and is never
    // auto-translated: rendered once. Only the shell adapts per recipient.
    const bodyHtml = renderMarkdown(template.bodyMarkdown);

    let sent = 0;
    let failed = 0;
    for (const recipient of recipients) {
      const html = renderEmailShell(bodyHtml, config.publicBaseUrl, getLocaleByEmail(recipient.email, db));
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
