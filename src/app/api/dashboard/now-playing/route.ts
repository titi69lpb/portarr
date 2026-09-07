import { NextResponse } from 'next/server';
import { getActiveSessions } from '@/lib/activity';
import { loadConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function GET() {
  const config = loadConfig();
  try {
    const sessions = await getActiveSessions(config.tautulli.url, config.tautulli.apiKey);
    return NextResponse.json(sessions);
  } catch (err) {
    console.error('Failed to fetch active sessions:', err);
    return NextResponse.json({ error: 'Failed to fetch active sessions' }, { status: 502 });
  }
}
