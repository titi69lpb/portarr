import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/route-auth';
import { getDb } from '@/lib/db';
import { setUserLocale } from '@/lib/user-locale';
import { isLocale } from '@/lib/i18n/dictionaries';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser(request);
    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    // null clears the personal override — see setUserLocale.
    if (body.locale !== null && !isLocale(body.locale)) {
      return NextResponse.json({ error: 'invalid locale' }, { status: 400 });
    }

    setUserLocale(getDb(), user.provider, user.userId, body.locale);
    return NextResponse.json({ locale: body.locale });
  } catch (err) {
    console.error('Failed to update locale:', err);
    return NextResponse.json({ error: 'Failed to update locale' }, { status: 502 });
  }
}
