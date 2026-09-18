import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { verifySetupToken } from '@/lib/setup';
import { applyServiceSettings } from '@/lib/setup-steps';
import { SERVICE_FIELDS } from '@/lib/settings-schema';
import type { ServiceKey } from '@/lib/settings-schema';

const VALID_SERVICES = Object.keys(SERVICE_FIELDS) as ServiceKey[];

export async function POST(request: NextRequest) {
  const db = getDb();
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token || !verifySetupToken(db, token)) {
    return NextResponse.json({ error: 'invalid_setup_token' }, { status: 403 });
  }

  let body: { service?: string; values?: Record<string, string> };
  try {
    body = (await request.json()) as { service?: string; values?: Record<string, string> };
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  if (!body.service || !body.values) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  if (!VALID_SERVICES.includes(body.service as ServiceKey)) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const result = await applyServiceSettings(db, body.service as ServiceKey, body.values);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }
  return NextResponse.json({ ok: true });
}
