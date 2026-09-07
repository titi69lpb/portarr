import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { listMailLog } from '@/lib/mail-log';
import { requireOwner } from '@/lib/route-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const denied = await requireOwner(request);
    if (denied) return denied;

    const db = getDb();
    return NextResponse.json({ entries: listMailLog(db) });
  } catch (err) {
    console.error('Failed to list mail log:', err);
    return NextResponse.json({ error: 'Failed to list mail log' }, { status: 502 });
  }
}
