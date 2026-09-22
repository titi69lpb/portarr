import { NextResponse } from 'next/server';
import { nowPlayingAll } from '@/lib/activity/aggregate';
import { getActivitySources } from '@/lib/activity/registry';
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
    const sessions = await nowPlayingAll(getActivitySources(config));
    return NextResponse.json(sessions);
  } catch (err) {
    console.error('Failed to fetch active sessions:', err);
    return NextResponse.json({ error: 'Failed to fetch active sessions' }, { status: 502 });
  }
}
