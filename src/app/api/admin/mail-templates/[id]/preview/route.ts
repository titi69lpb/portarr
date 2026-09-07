import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getMailTemplate } from '@/lib/mail-templates';
import { renderMarkdown } from '@/lib/markdown';
import { requireOwner } from '@/lib/route-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireOwner(request);
    if (denied) return denied;

    const id = Number(params.id);
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: 'invalid id' }, { status: 400 });
    }

    const db = getDb();
    const template = getMailTemplate(db, id);
    if (!template) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }

    return NextResponse.json({ html: renderMarkdown(template.bodyMarkdown) });
  } catch (err) {
    console.error('Failed to render mail template preview:', err);
    return NextResponse.json({ error: 'Failed to render mail template preview' }, { status: 502 });
  }
}
