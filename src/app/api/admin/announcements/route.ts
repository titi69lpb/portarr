import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { listAnnouncements, createAnnouncement } from '@/lib/announcements';
import { requireOwner } from '@/lib/route-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const denied = await requireOwner(request);
    if (denied) return denied;

    const db = getDb();
    return NextResponse.json({ announcements: listAnnouncements(db) });
  } catch (err) {
    console.error('Failed to list announcements:', err);
    return NextResponse.json({ error: 'Failed to list announcements' }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const denied = await requireOwner(request);
    if (denied) return denied;

    const body = await request.json();
    if (typeof body.contentMarkdown !== 'string' || body.contentMarkdown.trim() === '') {
      return NextResponse.json({ error: 'contentMarkdown is required' }, { status: 400 });
    }

    const db = getDb();
    const announcement = createAnnouncement(db, body.contentMarkdown);
    return NextResponse.json({ announcement }, { status: 201 });
  } catch (err) {
    console.error('Failed to create announcement:', err);
    return NextResponse.json({ error: 'Failed to create announcement' }, { status: 502 });
  }
}
