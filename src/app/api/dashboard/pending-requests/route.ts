import { NextResponse } from 'next/server';
import { getPendingRequests } from '@/lib/overseerr';
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
    const requests = await getPendingRequests(config.overseerr.url, config.overseerr.apiKey);
    return NextResponse.json(requests);
  } catch (err) {
    console.error('Failed to fetch pending requests:', err);
    return NextResponse.json({ error: 'Failed to fetch pending requests' }, { status: 502 });
  }
}
