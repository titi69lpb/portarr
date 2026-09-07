import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { listMailTemplates, createMailTemplate } from '@/lib/mail-templates';
import { requireOwner } from '@/lib/route-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const denied = await requireOwner(request);
    if (denied) return denied;

    const db = getDb();
    return NextResponse.json({ templates: listMailTemplates(db) });
  } catch (err) {
    console.error('Failed to list mail templates:', err);
    return NextResponse.json({ error: 'Failed to list mail templates' }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const denied = await requireOwner(request);
    if (denied) return denied;

    const body = await request.json();
    if (
      typeof body.name !== 'string' || body.name.trim() === '' ||
      typeof body.subject !== 'string' || body.subject.trim() === '' ||
      typeof body.bodyMarkdown !== 'string' || body.bodyMarkdown.trim() === ''
    ) {
      return NextResponse.json({ error: 'name, subject and bodyMarkdown are required' }, { status: 400 });
    }

    const db = getDb();
    const template = createMailTemplate(db, body.name, body.subject, body.bodyMarkdown);
    return NextResponse.json({ template }, { status: 201 });
  } catch (err) {
    console.error('Failed to create mail template:', err);
    return NextResponse.json({ error: 'Failed to create mail template' }, { status: 502 });
  }
}
