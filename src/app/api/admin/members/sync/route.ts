import { NextRequest, NextResponse } from 'next/server';
import { loadConfig, isSetupComplete, assertConfigured } from '@/lib/config';
import { getDb } from '@/lib/db';
import { getActiveProviders } from '@/lib/media/registry';
import { listMembersAll } from '@/lib/media/aggregate';
import { enrichMembersWithEmail, fetchSeerrUsers } from '@/lib/media/seerr-emails';
import { syncMembers } from '@/lib/member-sync';
import { requireOwner } from '@/lib/route-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const denied = await requireOwner(request);
  if (denied) return denied;

  try {
    const rawConfig = loadConfig(process.env, getDb());
    if (!isSetupComplete(rawConfig)) {
      return NextResponse.json({ error: 'setup_incomplete' }, { status: 503 });
    }
    const config = assertConfigured(rawConfig);
    let members = await listMembersAll(getActiveProviders(config));
    // Jellyfin has no email: fill the empty ones from Seerr. A Seerr failure
    // only leaves those members without an email (they are skipped by the sync).
    if (members.some((m) => m.provider === 'jellyfin' && !m.email)) {
      try {
        members = enrichMembersWithEmail(members, await fetchSeerrUsers(config.overseerr.url, config.overseerr.apiKey));
      } catch (err) {
        console.error('Failed to fetch Seerr users for member emails:', err instanceof Error ? err.message : 'unknown error');
      }
    }
    const db = getDb();
    const result = syncMembers(db, members);
    return NextResponse.json(result);
  } catch (err) {
    console.error('Failed to sync Plex users:', err);
    return NextResponse.json({ error: 'Failed to sync Plex users' }, { status: 502 });
  }
}
