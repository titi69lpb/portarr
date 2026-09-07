import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import {
  updateAnnouncementContent,
  setAnnouncementActive,
  deactivateAnnouncement,
  deleteAnnouncement,
} from '@/lib/announcements';
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

    if (typeof body.contentMarkdown === 'string') {
      const updated = updateAnnouncementContent(db, id, body.contentMarkdown);
      if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    if (body.active === true) {
      const updated = setAnnouncementActive(db, id);
      if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 });
    } else if (body.active === false) {
      const updated = deactivateAnnouncement(db, id);
      if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Failed to update announcement:', err);
    return NextResponse.json({ error: 'Failed to update announcement' }, { status: 502 });
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
    const deleted = deleteAnnouncement(db, id);
    if (!deleted) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Failed to delete announcement:', err);
    return NextResponse.json({ error: 'Failed to delete announcement' }, { status: 502 });
  }
}
