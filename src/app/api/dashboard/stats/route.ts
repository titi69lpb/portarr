import { NextRequest, NextResponse } from 'next/server';
import { globalStatsAll } from '@/lib/activity/aggregate';
import { getActivitySources, getActivitySourceFor } from '@/lib/activity/registry';
import type { PersonalStatsByType } from '@/lib/activity/types';
import { verifySession, SESSION_COOKIE_NAME } from '@/lib/session';
import { loadConfig, isSetupComplete, assertConfigured } from '@/lib/config';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const rawConfig = loadConfig(process.env, getDb());
  if (!isSetupComplete(rawConfig)) {
    return NextResponse.json({ error: 'setup_incomplete' }, { status: 503 });
  }
  const config = assertConfigured(rawConfig);
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const sessionUser = token ? await verifySession(token, config.session.secret) : null;

  try {
    const sources = getActivitySources(config);
    const extended = await globalStatsAll(sources);

    let personal = null;
    let personalByType: PersonalStatsByType | null = null;
    let recentHistory: Awaited<ReturnType<(typeof sources)[number]['recentHistory']>> = [];
    if (sessionUser) {
      const source = getActivitySourceFor(sources, sessionUser.provider);
      if (source) {
        [personal, personalByType, recentHistory] = await Promise.all([
          source.personalStats(sessionUser),
          source.personalStatsByType(sessionUser),
          source.recentHistory(sessionUser, 8),
        ]);
      }
    }

    return NextResponse.json({ personal, extended, personalByType, recentHistory });
  } catch (err) {
    console.error('Failed to fetch stats:', err);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 502 });
  }
}
