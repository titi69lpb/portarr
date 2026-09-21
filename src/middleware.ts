import { NextRequest, NextResponse } from 'next/server';
import { verifySession, SESSION_COOKIE_NAME, type SessionUser } from '@/lib/session';
import { isStillSharedUser } from '@/lib/media/plex';

// /setup and /api/setup/* are here (not a bespoke gate) because middleware
// cannot read DB-backed settings to know if setup is complete — Next.js 14
// middleware runs on the Edge runtime, which cannot bundle better-sqlite3 or
// touch the filesystem. The setup-completeness check itself now lives at the
// page/route level (Node runtime, has real DB access) — see the plan's
// 2026-09-18 revision.
const PUBLIC_PATHS = ['/login', '/logo.png', '/login-background.jpg', '/icon.png', '/manifest.webmanifest', '/sw.js', '/api/newsletter/poster', '/api/newsletter/unsubscribe', '/api/admin/newsletter/send', '/api/cron/request-availability', '/setup'];
const PUBLIC_PREFIXES = ['/api/auth/', '/api/newsletter/archive/', '/newsletter/', '/setup/', '/api/setup/'];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function shouldAllow(pathname: string, sessionUser: SessionUser | null): boolean {
  if (isPublicPath(pathname)) return true;
  return sessionUser !== null;
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Public paths never need a session — skip the JWT verify entirely for them
  // (a dashboard load pulls in dozens of poster-proxy images, each of which
  // would otherwise pay for a verify it can never use).
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // SESSION_SECRET is always a plain env var (see entrypoint.sh) — never
  // DB-backed, so this never needs config.ts/db.ts. If it's somehow unset
  // (shouldn't happen in Docker; possible in a misconfigured local dev
  // environment), every session fails to verify and every request gets
  // redirected to /login, which is the safe failure mode.
  const sessionSecret = process.env.SESSION_SECRET;
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  let sessionUser = token && sessionSecret ? await verifySession(token, sessionSecret) : null;

  // Session cookies last 30 days and, until now, were never re-checked against
  // Plex after login — a share revoked at plex.tv kept full portal access for
  // up to 30 days. Owner sessions are exempt (see isStillSharedUser).
  // isStillSharedUser fails open on a Plex/network error, so an upstream
  // hiccup never locks everyone out at once. Plex creds are read directly
  // from env here (never via config.ts/DB) — an install with Plex configured
  // only via the DB/wizard skips this specific revalidation check (falls
  // back to the plain 30-day JWT expiry), a known, accepted degradation
  // documented in the plan's 2026-09-18 revision.
  const plexServerToken = process.env.PLEX_SERVER_TOKEN;
  const plexServerName = process.env.PLEX_SERVER_NAME;
  if (sessionUser && !sessionUser.isOwner && plexServerToken && plexServerName) {
    const stillShared = await isStillSharedUser(sessionUser.plexId, plexServerToken, plexServerName);
    if (!stillShared) {
      sessionUser = null;
    }
  }

  if (shouldAllow(pathname, sessionUser)) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    const response = NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  }

  const loginUrl = new URL('/login', request.url);
  const response = NextResponse.redirect(loginUrl);
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
