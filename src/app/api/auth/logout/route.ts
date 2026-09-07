import { NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/lib/session';

export async function POST() {
  const response = NextResponse.json({ status: 'ok' });
  response.cookies.delete({ name: SESSION_COOKIE_NAME, path: '/' });
  return response;
}
