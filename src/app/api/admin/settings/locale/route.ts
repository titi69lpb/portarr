import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/route-auth';
import { getDb } from '@/lib/db';
import { setSetting } from '@/lib/settings';
import { isLocale } from '@/lib/i18n/dictionaries';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const denied = await requireOwner(request);
    if (denied) return denied;

    const body = await request.json();
    if (!isLocale(body.locale)) {
      return NextResponse.json({ error: 'invalid locale' }, { status: 400 });
    }

    const db = getDb();
    setSetting(db, 'default_locale', body.locale);
    return NextResponse.json({ locale: body.locale });
  } catch (err) {
    console.error('Failed to update setting:', err);
    return NextResponse.json({ error: 'Failed to update setting' }, { status: 502 });
  }
}
