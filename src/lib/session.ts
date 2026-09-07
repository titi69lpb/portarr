import { SignJWT, jwtVerify } from 'jose';

export const SESSION_COOKIE_NAME = 'portal_session';
const SESSION_DURATION = '30d';

export interface SessionUser {
  plexId: string;
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
    if (
      typeof payload.plexId === 'string' &&
      typeof payload.email === 'string' &&
      typeof payload.username === 'string' &&
      typeof payload.isOwner === 'boolean'
    ) {
      return {
        plexId: payload.plexId,
        email: payload.email,
        username: payload.username,
        isOwner: payload.isOwner,
      };
    }
    return null;
  } catch {
    return null;
  }
}
