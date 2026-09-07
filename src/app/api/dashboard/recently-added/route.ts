import { NextResponse } from 'next/server';
import { getRecentlyAdded } from '@/lib/plex';
import { loadConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function GET() {
  const config = loadConfig();
  try {
    const items = await getRecentlyAdded(config.plex.url, config.plex.serverToken, 15);
    return NextResponse.json(items);
  } catch (err) {
    console.error('Failed to fetch recently added:', err);
    return NextResponse.json({ error: 'Failed to fetch recently added' }, { status: 502 });
  }
}
