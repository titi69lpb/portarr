import { SignJWT, jwtVerify } from 'jose';
import { isProviderId, type ProviderId } from './media/types';

export const SESSION_COOKIE_NAME = 'portal_session';
const SESSION_DURATION = '30d';

export interface SessionUser {
  provider: ProviderId;
  userId: string;
  email: string;
  username: string;
  isOwner: boolean;
}

export async function createSession(user: SessionUser, secret: string): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(SESSION_DURATION)
    .sign(key);
}

export async function verifySession(
  token: string,
  secret: string
): Promise<SessionUser | null> {
  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key);
    const { email, username, isOwner } = payload;
    if (typeof email !== 'string' || typeof username !== 'string' || typeof isOwner !== 'boolean') {
      return null;
    }
    if (isProviderId(payload.provider) && typeof payload.userId === 'string') {
      return { provider: payload.provider, userId: payload.userId, email, username, isOwner };
    }
    // Sessions signed before the provider dimension existed carry `plexId`
    // and no `provider` — only Plex existed then, so read them as plex. This
    // keeps 30-day cookies valid across the upgrade.
    if (payload.provider === undefined && typeof payload.plexId === 'string') {
      return { provider: 'plex', userId: payload.plexId, email, username, isOwner };
    }
    return null;
  } catch {
    return null;
  }
}
