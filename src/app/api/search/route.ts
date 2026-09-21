import { NextRequest, NextResponse } from 'next/server';
import { verifySession, SESSION_COOKIE_NAME } from '@/lib/session';
import { loadConfig, isSetupComplete, assertConfigured } from '@/lib/config';
import { getDb } from '@/lib/db';
import { getActiveProviders } from '@/lib/media/registry';
import { searchAll } from '@/lib/media/aggregate';

export const dynamic = 'force-dynamic';

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

    const query = request.nextUrl.searchParams.get('q') ?? '';
    if (!query.trim()) {
      return NextResponse.json({ results: [] });
    }

    const results = await searchAll(getActiveProviders(config), query);
    return NextResponse.json({ results });
  } catch (err) {
    console.error('Failed to search Plex library:', err);
    return NextResponse.json({ error: 'Failed to search Plex library' }, { status: 502 });
  }
}
