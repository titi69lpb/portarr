import { NextResponse } from 'next/server';
import { getUpcomingReleases } from '@/lib/calendar';
import { loadConfig, isSetupComplete, assertConfigured } from '@/lib/config';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const rawConfig = loadConfig(process.env, getDb());
  // Not session-gated at the route level, but middleware already requires a
  // valid session for this path — and a session can't exist pre-setup — so
  // this is unreachable pre-setup in practice. Still narrow explicitly.
  if (!isSetupComplete(rawConfig)) {
    return NextResponse.json({ error: 'setup_incomplete' }, { status: 503 });
  }
  const config = assertConfigured(rawConfig);
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
