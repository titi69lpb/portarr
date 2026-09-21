import { NextRequest, NextResponse } from 'next/server';
import { loadConfig, isSetupComplete, assertConfigured } from '@/lib/config';
import { getDb } from '@/lib/db';
import { getActiveProviders, getPasswordAuth } from '@/lib/media/registry';
import { completeLogin, resolveLoginEmail } from '@/lib/login';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

// Portarr must not become a password-guessing relay in front of Jellyfin:
// limit per IP (like the Plex login) AND per username, so one account cannot
// be hammered from many addresses. A consequence, accepted: someone can burn a
// legitimate user's attempts for a few minutes.
const IP_LIMIT = { max: 10, windowMs: 5 * 60 * 1000 };
const USERNAME_LIMIT = { max: 5, windowMs: 5 * 60 * 1000 };
const MAX_USERNAME_LENGTH = 128;
const MAX_PASSWORD_LENGTH = 256;
const TOO_MANY = { error: 'Trop de tentatives, réessayez plus tard.' };

export async function POST(request: NextRequest) {
  if (!checkRateLimit(`password-login-ip:${getClientIp(request)}`, IP_LIMIT)) {
    return NextResponse.json(TOO_MANY, { status: 429 });
  }

  let body: { provider?: unknown; username?: unknown; password?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const { provider, username, password } = body;
  if (
    provider !== 'jellyfin' ||
    typeof username !== 'string' ||
    typeof password !== 'string' ||
    !username.trim() ||
    !password ||
    username.length > MAX_USERNAME_LENGTH ||
    password.length > MAX_PASSWORD_LENGTH
  ) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
  const name = username.trim();

  if (!checkRateLimit(`password-login-user:${name.toLowerCase()}`, USERNAME_LIMIT)) {
    return NextResponse.json(TOO_MANY, { status: 429 });
  }

  try {
    const rawConfig = loadConfig(process.env, getDb());
    if (!isSetupComplete(rawConfig)) {
      return NextResponse.json({ error: 'setup_incomplete' }, { status: 503 });
    }
    const config = assertConfigured(rawConfig);
    if (!getActiveProviders(config).some((p) => p.id === 'jellyfin')) {
      return NextResponse.json({ error: 'provider_unavailable' }, { status: 400 });
    }

    const result = await getPasswordAuth(config, 'jellyfin').authenticate(name, password);
    if (result.status !== 'ok') {
      // Same answer for a wrong password, an unknown account and a disabled one.
      return NextResponse.json({ status: 'denied' }, { status: 401 });
    }

    const db = getDb();
    const member = await resolveLoginEmail(db, result.user, config.overseerr);
    return await completeLogin(db, config.session.secret, member, result.isOwner);
  } catch (err) {
    // Only the message: never the request, the body or the password.
    console.error('Failed to verify password login:', err instanceof Error ? err.message : 'unknown error');
    return NextResponse.json({ error: 'Failed to verify login' }, { status: 502 });
  }
}
