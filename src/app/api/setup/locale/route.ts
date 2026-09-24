import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { verifySetupToken } from '@/lib/setup';
import { setSetting } from '@/lib/settings';
import { isLocale } from '@/lib/i18n/dictionaries';
import { loadConfig, isSetupComplete } from '@/lib/config';

export const dynamic = 'force-dynamic';

// First wizard step: persists the instance default language. Guarded exactly
// like /api/setup/step (setup token + setup not yet complete).
export async function POST(request: NextRequest) {
  const db = getDb();
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token || !verifySetupToken(db, token)) {
    return NextResponse.json({ error: 'invalid_setup_token' }, { status: 403 });
  }

  if (isSetupComplete(loadConfig(process.env, db))) {
    return NextResponse.json({ error: 'setup_already_complete' }, { status: 409 });
  }

  let body: { locale?: unknown };
  try {
    body = (await request.json()) as { locale?: unknown };
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  if (!isLocale(body.locale)) {
    return NextResponse.json({ error: 'invalid locale' }, { status: 400 });
  }

  setSetting(db, 'default_locale', body.locale);
  // The admin made an explicit choice; locale_auto just marks this install as
  // a fresh (post-i18n) one so browser-language fallback stays enabled if the
  // default is ever cleared (see getInstanceLocale).
  setSetting(db, 'locale_auto', '1');
  return NextResponse.json({ ok: true, locale: body.locale });
}
