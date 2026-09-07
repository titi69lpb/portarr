import { NextRequest, NextResponse } from 'next/server';
import { verifySession, SESSION_COOKIE_NAME } from '@/lib/session';
import { loadConfig } from '@/lib/config';
import { getUserIdByEmail, getWatchHistoryPage } from '@/lib/tautulli';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 30;

export async function GET(request: NextRequest) {
  try {
    const config = loadConfig();
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const sessionUser = token ? await verifySession(token, config.session.secret) : null;
    if (!sessionUser) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const rawOffset = Number(request.nextUrl.searchParams.get('offset') ?? '0');
    const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? Math.floor(rawOffset) : 0;

    const userId = await getUserIdByEmail(config.tautulli.url, config.tautulli.apiKey, sessionUser.email);
    if (userId === null) {
      return NextResponse.json({ items: [], total: 0 });
    }

    const page = await getWatchHistoryPage(
      config.tautulli.url,
      config.tautulli.apiKey,
      userId,
      offset,
      PAGE_SIZE
    );
    return NextResponse.json(page);
  } catch (err) {
    console.error('Failed to fetch watch history page:', err);
    return NextResponse.json({ error: 'Failed to fetch watch history page' }, { status: 502 });
  }
}
