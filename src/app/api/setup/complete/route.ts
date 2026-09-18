import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { loadConfig, isSetupComplete } from '@/lib/config';
import { verifySetupToken, invalidateSetupToken } from '@/lib/setup';

// Called by the wizard after its last step. Never trusts the client's claim
// that setup succeeded — re-derives isSetupComplete server-side from the
// actual config before invalidating the token. No request body is read;
// this route takes no input beyond the setup-token header.
export async function POST(request: NextRequest) {
  const db = getDb();
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token || !verifySetupToken(db, token)) {
    return NextResponse.json({ error: 'invalid_setup_token' }, { status: 403 });
  }

  const config = loadConfig(process.env, db);
  if (!isSetupComplete(config)) {
    return NextResponse.json({ error: 'setup_incomplete' }, { status: 422 });
  }

  invalidateSetupToken(db);
  return NextResponse.json({ ok: true });
}
