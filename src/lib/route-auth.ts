import { NextRequest, NextResponse } from 'next/server';
import { verifySession, SESSION_COOKIE_NAME, type SessionUser } from '@/lib/session';
import { loadConfig } from '@/lib/config';

// Shared owner-only route guard. Was byte-identical in 5 admin route files
// (announcements, mail-templates x3, mail-templates/[id]/preview) — extracted
// so the auth contract lives in one place instead of five copies that could
// drift.
export async function requireOwner(request: NextRequest): Promise<NextResponse | null> {
  const config = loadConfig();
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
  const config = loadConfig();
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
