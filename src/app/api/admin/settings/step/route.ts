import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireOwner } from '@/lib/route-auth';
import { applyServiceSettings } from '@/lib/setup-steps';
import { SERVICE_FIELDS, type ServiceKey } from '@/lib/settings-schema';

const VALID_SERVICES = Object.keys(SERVICE_FIELDS) as ServiceKey[];

// Owner-gated sibling of /api/setup/step, used for post-setup editing. Same
// underlying applyServiceSettings call, different auth gate.
export async function POST(request: NextRequest) {
  const authError = await requireOwner(request);
  if (authError) return authError;

  const db = getDb();

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
