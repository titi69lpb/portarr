import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { verifySetupToken } from '@/lib/setup';
import { applyServiceSettings } from '@/lib/setup-steps';
import { SERVICE_FIELDS } from '@/lib/settings-schema';
import type { ServiceKey } from '@/lib/settings-schema';
import { loadConfig, isSetupComplete } from '@/lib/config';

const VALID_SERVICES = Object.keys(SERVICE_FIELDS) as ServiceKey[];

export async function POST(request: NextRequest) {
  const db = getDb();
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token || !verifySetupToken(db, token)) {
    return NextResponse.json({ error: 'invalid_setup_token' }, { status: 403 });
  }

  // The setup token row isn't invalidated until /api/setup/complete runs —
  // if a user abandons the wizard partway (e.g. finishes the rest via .env +
  // restart) the token can outlive setup completion indefinitely. Without
  // this guard, an old/leaked/guessed token could still silently overwrite
  // DB-sourced service settings on an already-configured, in-production install.
  if (isSetupComplete(loadConfig(process.env, db))) {
    return NextResponse.json({ error: 'setup_already_complete' }, { status: 409 });
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
