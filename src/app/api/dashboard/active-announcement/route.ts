import { NextRequest, NextResponse } from 'next/server';
import { verifySession, SESSION_COOKIE_NAME } from '@/lib/session';
import { loadConfig } from '@/lib/config';
import { getDb } from '@/lib/db';
import { getActiveAnnouncement } from '@/lib/announcements';
import { renderMarkdown } from '@/lib/markdown';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const config = loadConfig();
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const sessionUser = token ? await verifySession(token, config.session.secret) : null;
    if (!sessionUser) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const db = getDb();
    const announcement = getActiveAnnouncement(db);
    if (!announcement) {
      return NextResponse.json({ announcement: null });
    }
    return NextResponse.json({
      announcement: {
        id: announcement.id,
        contentHtml: renderMarkdown(announcement.contentMarkdown),
        updatedAt: announcement.updatedAt,
      },
    });
  } catch (err) {
    console.error('Failed to fetch active announcement:', err);
    return NextResponse.json({ error: 'Failed to fetch active announcement' }, { status: 502 });
  }
}
