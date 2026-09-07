import { NextRequest, NextResponse } from 'next/server';
import { loadConfig } from '@/lib/config';
import { getDb } from '@/lib/db';
import { getSharedUsers } from '@/lib/plex';
import { syncPlexUsers } from '@/lib/member-sync';
import { requireOwner } from '@/lib/route-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const denied = await requireOwner(request);
  if (denied) return denied;

  try {
    const config = loadConfig();
    const plexUsers = await getSharedUsers(config.plex.serverToken, config.plex.serverName);
    const db = getDb();
    const result = syncPlexUsers(db, plexUsers);
    return NextResponse.json(result);
  } catch (err) {
    console.error('Failed to sync Plex users:', err);
    return NextResponse.json({ error: 'Failed to sync Plex users' }, { status: 502 });
  }
}
