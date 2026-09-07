import { NextRequest, NextResponse } from 'next/server';
import { createPin } from '@/lib/plex';
import { loadConfig } from '@/lib/config';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

// Creates a new Plex PIN against plex.tv on every call and is reachable
// pre-auth by design (it's how login starts) — rate-limited per IP so it
// can't be used to hammer plex.tv or enumerate anything at will.
const LOGIN_RATE_LIMIT = { max: 10, windowMs: 5 * 60 * 1000 };

export async function POST(request: NextRequest) {
  if (!checkRateLimit(`login:${getClientIp(request)}`, LOGIN_RATE_LIMIT)) {
    return NextResponse.json({ error: 'Trop de tentatives, réessayez plus tard.' }, { status: 429 });
  }

  try {
    const config = loadConfig();
    const { pinId, authUrl } = await createPin(config.plex.clientIdentifier);
    return NextResponse.json({ pinId, authUrl });
  } catch (err) {
    console.error('Failed to create Plex login PIN:', err);
    return NextResponse.json({ error: 'Failed to initiate login' }, { status: 502 });
  }
}
