import { NextRequest, NextResponse } from 'next/server';
import { verifySession, SESSION_COOKIE_NAME } from '@/lib/session';
import { loadConfig, isSetupComplete, assertConfigured } from '@/lib/config';
import { getDb } from '@/lib/db';
import { getActivitySources, getActivitySourceFor } from '@/lib/activity/registry';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 30;

export async function GET(request: NextRequest) {
  try {
    const rawConfig = loadConfig(process.env, getDb());
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const sessionUser = token ? await verifySession(token, rawConfig.session.secret) : null;
    if (!sessionUser) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    if (!isSetupComplete(rawConfig)) {
      return NextResponse.json({ error: 'setup_incomplete' }, { status: 503 });
    }
    const config = assertConfigured(rawConfig);

    const rawOffset = Number(request.nextUrl.searchParams.get('offset') ?? '0');
    const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? Math.floor(rawOffset) : 0;

    const source = getActivitySourceFor(getActivitySources(config), sessionUser.provider);
    if (!source) {
      return NextResponse.json({ items: [], total: 0 });
    }

    const page = await source.historyPage(sessionUser, offset, PAGE_SIZE);
    return NextResponse.json(page);
  } catch (err) {
    console.error('Failed to fetch watch history page:', err);
    return NextResponse.json({ error: 'Failed to fetch watch history page' }, { status: 502 });
  }
}
