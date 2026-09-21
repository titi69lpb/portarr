import { NextRequest, NextResponse } from 'next/server';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/session';
import { loadConfig, isSetupComplete, assertConfigured } from '@/lib/config';
import { getDb } from '@/lib/db';
import { resolvePinToSession, defaultDeps } from '@/lib/media/plex-pin';

export async function GET(request: NextRequest) {
  const pinId = Number(request.nextUrl.searchParams.get('pinId'));
  if (!pinId) {
    return NextResponse.json({ error: 'pinId is required' }, { status: 400 });
  }

  try {
    const rawConfig = loadConfig(process.env, getDb());
    if (!isSetupComplete(rawConfig)) {
      return NextResponse.json({ error: 'setup_incomplete' }, { status: 503 });
    }
    const config = assertConfigured(rawConfig);
    const result = await resolvePinToSession(pinId, defaultDeps, {
      clientIdentifier: config.plex.clientIdentifier,
      serverToken: config.plex.serverToken,
      serverName: config.plex.serverName,
    });

    if (result.status !== 'ok') {
      return NextResponse.json({ status: result.status });
    }

    const db = getDb();
    db.prepare(
      `INSERT INTO users (provider, external_id, email, username, last_login) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(provider, external_id) DO UPDATE SET email = excluded.email, username = excluded.username, last_login = excluded.last_login`
    ).run(result.user.provider, result.user.userId, result.user.email, result.user.username, new Date().toISOString());

    const token = await createSession(
      { ...result.user, isOwner: result.isOwner },
      config.session.secret
    );
    const response = NextResponse.json({ status: 'ok' });
    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  } catch (err) {
    console.error('Failed to verify login status:', err);
    return NextResponse.json({ error: 'Failed to verify login status' }, { status: 502 });
  }
}
