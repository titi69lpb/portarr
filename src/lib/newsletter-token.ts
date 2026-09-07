import { SignJWT, jwtVerify } from 'jose';

const TOKEN_DURATION = '90d';

export async function signUnsubscribeToken(plexId: string, secret: string): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ plexId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_DURATION)
    .sign(key);
}

export async function verifyUnsubscribeToken(token: string, secret: string): Promise<string | null> {
  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key);
    if (typeof payload.plexId === 'string') {
      return payload.plexId;
    }
    return null;
  } catch {
    return null;
  }
}
