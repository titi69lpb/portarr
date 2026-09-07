import { NextRequest, NextResponse } from 'next/server';
import { verifySession, SESSION_COOKIE_NAME, type SessionUser } from '@/lib/session';
import { loadConfig } from '@/lib/config';
import { isStillSharedUser } from '@/lib/plex';

const PUBLIC_PATHS = ['/login', '/logo.png', '/login-background.jpg', '/icon.png', '/manifest.webmanifest', '/sw.js', '/api/newsletter/poster', '/api/newsletter/unsubscribe', '/api/admin/newsletter/send', '/api/cron/request-availability'];
const PUBLIC_PREFIXES = ['/api/auth/', '/api/newsletter/archive/', '/newsletter/'];

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

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const config = loadConfig();
  let sessionUser = token ? await verifySession(token, config.session.secret) : null;

  // Session cookies last 30 days and, until now, were never re-checked against
  // Plex after login — a share revoked at plex.tv kept full portal access for
  // up to 30 days. Owner sessions are exempt (see isStillSharedUser).
  // isStillSharedUser fails open on a Plex/network error, so an upstream
  // hiccup never locks everyone out at once.
  if (sessionUser && !sessionUser.isOwner) {
    const stillShared = await isStillSharedUser(
      sessionUser.plexId,
      config.plex.serverToken,
      config.plex.serverName
    );
    if (!stillShared) {
      sessionUser = null;
    }
  }

  if (shouldAllow(pathname, sessionUser)) {
    return NextResponse.next();
  }

  if (request.nextUrl.pathname.startsWith('/api/')) {
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
