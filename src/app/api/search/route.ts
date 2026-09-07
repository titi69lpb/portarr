import { NextRequest, NextResponse } from 'next/server';
import { verifySession, SESSION_COOKIE_NAME } from '@/lib/session';
import { loadConfig } from '@/lib/config';
import { searchLibrary } from '@/lib/plex';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const config = loadConfig();
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const sessionUser = token ? await verifySession(token, config.session.secret) : null;
    if (!sessionUser) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const query = request.nextUrl.searchParams.get('q') ?? '';
    if (!query.trim()) {
      return NextResponse.json({ results: [] });
    }

    const results = await searchLibrary(config.plex.url, config.plex.serverToken, query);
    return NextResponse.json({ results });
  } catch (err) {
    console.error('Failed to search Plex library:', err);
    return NextResponse.json({ error: 'Failed to search Plex library' }, { status: 502 });
  }
}
