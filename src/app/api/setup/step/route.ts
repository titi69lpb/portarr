import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { verifySetupToken } from '@/lib/setup';
import { applyServiceSettings } from '@/lib/setup-steps';
import type { ServiceKey } from '@/lib/settings-schema';

export async function POST(request: NextRequest) {
  const db = getDb();
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token || !verifySetupToken(db, token)) {
    return NextResponse.json({ error: 'invalid_setup_token' }, { status: 403 });
  }

  const body = (await request.json()) as { service?: string; values?: Record<string, string> };
  if (!body.service || !body.values) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const result = await applyServiceSettings(db, body.service as ServiceKey, body.values);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }
  return NextResponse.json({ ok: true });
}
