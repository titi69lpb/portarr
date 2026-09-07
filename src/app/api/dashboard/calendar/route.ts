import { NextResponse } from 'next/server';
import { getUpcomingReleases } from '@/lib/calendar';
import { loadConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function GET() {
  const config = loadConfig();
  const start = new Date();
  const end = new Date();
  end.setDate(end.getDate() + 14);
  try {
    const items = await getUpcomingReleases(config.sonarr, config.radarr, start, end);
    const filtered = items.filter((item) => item.releaseDate !== '');
    return NextResponse.json(filtered);
  } catch (err) {
    console.error('Failed to fetch calendar:', err);
    return NextResponse.json({ error: 'Failed to fetch calendar' }, { status: 502 });
  }
}
