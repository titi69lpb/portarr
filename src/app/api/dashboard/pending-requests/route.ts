import { NextResponse } from 'next/server';
import { getPendingRequests } from '@/lib/overseerr';
import { loadConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function GET() {
  const config = loadConfig();
  try {
    const requests = await getPendingRequests(config.overseerr.url, config.overseerr.apiKey);
    return NextResponse.json(requests);
  } catch (err) {
    console.error('Failed to fetch pending requests:', err);
    return NextResponse.json({ error: 'Failed to fetch pending requests' }, { status: 502 });
  }
}
