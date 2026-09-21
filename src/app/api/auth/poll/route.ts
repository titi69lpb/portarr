import { NextRequest, NextResponse } from 'next/server';
import { completeLogin } from '@/lib/login';
import { loadConfig, isSetupComplete, assertConfigured } from '@/lib/config';
import { getDb } from '@/lib/db';
import { getPinAuth } from '@/lib/media/registry';

export async function GET(request: NextRequest) {
  const pinId = Number(request.nextUrl.searchParams.get('pinId'));
  if (!pinId) {
    return NextResponse.json({ error: 'pinId is required' }, { status: 400 });
  }

  try {
    const rawConfig = loadConfig(process.env, getDb());
    if (!isSetupComplete(rawConfig)) {
      return NextResponse.json({ error: 'setup_incomplete' }, { status: 503 });
    }
    const config = assertConfigured(rawConfig);
    // Plex logs in through the PIN flow; Jellyfin uses POST /api/auth/password.
    const result = await getPinAuth(config, 'plex').resolvePin(pinId);

    if (result.status !== 'ok') {
      return NextResponse.json({ status: result.status });
    }

    return await completeLogin(getDb(), config.session.secret, result.user, result.isOwner);
  } catch (err) {
    console.error('Failed to verify login status:', err);
    return NextResponse.json({ error: 'Failed to verify login status' }, { status: 502 });
  }
}
