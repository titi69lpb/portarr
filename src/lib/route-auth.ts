import { NextRequest, NextResponse } from 'next/server';
import { verifySession, SESSION_COOKIE_NAME, type SessionUser } from '@/lib/session';
import { loadConfig } from '@/lib/config';
import { getDb } from '@/lib/db';

// Shared owner-only route guard. Was byte-identical in 5 admin route files
// (announcements, mail-templates x3, mail-templates/[id]/preview) — extracted
// so the auth contract lives in one place instead of five copies that could
// drift.
//
// Only reads config.session.secret (never nullable, unaffected by Task 4) —
// deliberately not wrapped in assertConfigured. A session can only exist if
// login succeeded, which requires Plex to be configured, but verifying that
// isn't this function's job: wrapping here would turn a clean 401 into an
// uncaught 500 for a request that has no cookie at all, pre-setup.
export async function requireOwner(request: NextRequest): Promise<NextResponse | null> {
  const config = loadConfig(process.env, getDb());
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const sessionUser = token ? await verifySession(token, config.session.secret) : null;
  if (!sessionUser) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!sessionUser.isOwner) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  return null;
}

export async function getSessionUser(request: NextRequest): Promise<SessionUser | null> {
  const config = loadConfig(process.env, getDb());
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  return token ? await verifySession(token, config.session.secret) : null;
}

// Same owner-only gate as requireOwner, but also hands back the resolved user
// for routes that need it afterward (e.g. to email/log against the caller).
export async function requireOwnerUser(
  request: NextRequest
): Promise<{ user: SessionUser } | { response: NextResponse }> {
  const user = await getSessionUser(request);
  if (!user) {
    return { response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  }
  if (!user.isOwner) {
    return { response: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  }
  return { user };
}
