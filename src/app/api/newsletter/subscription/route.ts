import { NextRequest, NextResponse } from 'next/server';
import { verifySession, SESSION_COOKIE_NAME } from '@/lib/session';
import { loadConfig } from '@/lib/config';
import { getDb } from '@/lib/db';
import { isSubscribed, setSubscribed } from '@/lib/newsletter-subscriptions';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const config = loadConfig();
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const sessionUser = token ? await verifySession(token, config.session.secret) : null;
    if (!sessionUser) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const db = getDb();
    return NextResponse.json({ subscribed: isSubscribed(db, sessionUser.plexId) });
  } catch (err) {
    console.error('Failed to read newsletter subscription:', err);
    return NextResponse.json({ error: 'Failed to read newsletter subscription' }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const config = loadConfig();
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const sessionUser = token ? await verifySession(token, config.session.secret) : null;
    if (!sessionUser) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    if (typeof body.subscribed !== 'boolean') {
      return NextResponse.json({ error: 'subscribed must be a boolean' }, { status: 400 });
    }

    const db = getDb();
    setSubscribed(db, sessionUser.plexId, body.subscribed);
    return NextResponse.json({ subscribed: body.subscribed });
  } catch (err) {
    console.error('Failed to update newsletter subscription:', err);
    return NextResponse.json({ error: 'Failed to update newsletter subscription' }, { status: 502 });
  }
}
