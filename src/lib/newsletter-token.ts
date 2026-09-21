import { SignJWT, jwtVerify } from 'jose';
import { isProviderId, type MemberRef } from './media/types';

const TOKEN_DURATION = '90d';

export async function signUnsubscribeToken(ref: MemberRef, secret: string): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ provider: ref.provider, userId: ref.userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_DURATION)
    .sign(key);
}

export async function verifyUnsubscribeToken(token: string, secret: string): Promise<MemberRef | null> {
  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key);
    if (isProviderId(payload.provider) && typeof payload.userId === 'string') {
      return { provider: payload.provider, userId: payload.userId };
    }
    // Links already sitting in users' mailboxes (90-day tokens) were signed
    // with { plexId } before providers existed — keep them working as plex.
    if (payload.provider === undefined && typeof payload.plexId === 'string') {
      return { provider: 'plex', userId: payload.plexId };
    }
    return null;
  } catch {
    return null;
  }
}
