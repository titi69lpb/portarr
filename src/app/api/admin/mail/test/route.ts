import { NextRequest, NextResponse } from 'next/server';
import { loadConfig } from '@/lib/config';
import { getDb } from '@/lib/db';
import { getMailTemplate } from '@/lib/mail-templates';
import { hashContent } from '@/lib/mail-guard';
import { renderMarkdown } from '@/lib/markdown';
import { renderEmailShell } from '@/lib/email-template';
import { createTransport, sendMail } from '@/lib/mailer';
import { insertMailLog } from '@/lib/mail-log';
import { requireOwnerUser } from '@/lib/route-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOwnerUser(request);
    if ('response' in auth) return auth.response;
    const sessionUser = auth.user;

    const config = loadConfig();
    const body = await request.json();
    const db = getDb();
    const template = getMailTemplate(db, Number(body.templateId));
    if (!template) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }

    const hash = hashContent(template.subject, template.bodyMarkdown);
    const transport = createTransport(config.smtp);
    const from = `"${config.smtp.fromName}" <${config.smtp.fromAddress}>`;
    const html = renderEmailShell(renderMarkdown(template.bodyMarkdown), config.publicBaseUrl);

    await sendMail(transport, from, sessionUser.email, template.subject, html);
    insertMailLog(db, {
      templateId: template.id,
      templateName: template.name,
      recipientEmail: sessionUser.email,
      recipientUsername: sessionUser.username,
      status: 'test',
    });

    return NextResponse.json({ hash });
  } catch (err) {
    console.error('Failed to send test mail:', err);
    return NextResponse.json({ error: 'Failed to send test mail' }, { status: 502 });
  }
}
