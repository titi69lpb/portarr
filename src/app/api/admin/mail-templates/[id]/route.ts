import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { updateMailTemplate, deleteMailTemplate } from '@/lib/mail-templates';
import { requireOwner } from '@/lib/route-auth';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireOwner(request);
    if (denied) return denied;

    const id = Number(params.id);
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: 'invalid id' }, { status: 400 });
    }

    const body = await request.json();
    const db = getDb();
    const template = updateMailTemplate(db, id, {
      name: typeof body.name === 'string' ? body.name : undefined,
      subject: typeof body.subject === 'string' ? body.subject : undefined,
      bodyMarkdown: typeof body.bodyMarkdown === 'string' ? body.bodyMarkdown : undefined,
    });
    if (!template) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    return NextResponse.json({ template });
  } catch (err) {
    console.error('Failed to update mail template:', err);
    return NextResponse.json({ error: 'Failed to update mail template' }, { status: 502 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireOwner(request);
    if (denied) return denied;

    const id = Number(params.id);
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: 'invalid id' }, { status: 400 });
    }

    const db = getDb();
    const deleted = deleteMailTemplate(db, id);
    if (!deleted) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Failed to delete mail template:', err);
    return NextResponse.json({ error: 'Failed to delete mail template' }, { status: 502 });
  }
}
