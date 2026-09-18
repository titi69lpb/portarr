import { NextResponse } from 'next/server';
import { getRecentlyAdded } from '@/lib/plex';
import { loadConfig, isSetupComplete, assertConfigured } from '@/lib/config';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const rawConfig = loadConfig(process.env, getDb());
  if (!isSetupComplete(rawConfig)) {
    return NextResponse.json({ error: 'setup_incomplete' }, { status: 503 });
  }
  const config = assertConfigured(rawConfig);
  try {
    const items = await getRecentlyAdded(config.plex.url, config.plex.serverToken, 15);
    return NextResponse.json(items);
  } catch (err) {
    console.error('Failed to fetch recently added:', err);
    return NextResponse.json({ error: 'Failed to fetch recently added' }, { status: 502 });
  }
}
