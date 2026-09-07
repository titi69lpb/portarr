import { NextRequest, NextResponse } from 'next/server';
import {
  getPersonalStats,
  getExtendedStats,
  getPersonalStatsByType,
  getUserIdByEmail,
  getRecentWatchHistory,
  type PersonalStatsByType,
} from '@/lib/tautulli';
import { verifySession, SESSION_COOKIE_NAME } from '@/lib/session';
import { loadConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const config = loadConfig();
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const sessionUser = token ? await verifySession(token, config.session.secret) : null;

  try {
    const extended = await getExtendedStats(config.tautulli.url, config.tautulli.apiKey);
    const personal = sessionUser
      ? await getPersonalStats(config.tautulli.url, config.tautulli.apiKey, sessionUser.email)
      : null;

    let personalByType: PersonalStatsByType | null = null;
    let recentHistory: Awaited<ReturnType<typeof getRecentWatchHistory>> = [];
    if (sessionUser) {
      const userId = await getUserIdByEmail(config.tautulli.url, config.tautulli.apiKey, sessionUser.email);
      if (userId !== null) {
        [personalByType, recentHistory] = await Promise.all([
          getPersonalStatsByType(config.tautulli.url, config.tautulli.apiKey, userId),
          getRecentWatchHistory(config.tautulli.url, config.tautulli.apiKey, userId),
        ]);
      }
    }

    return NextResponse.json({ personal, extended, personalByType, recentHistory });
  } catch (err) {
    console.error('Failed to fetch stats:', err);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 502 });
  }
}
