import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Body content is irrelevant — the client only measures how long the
// round-trip to this endpoint took. Kept as small as possible so the
// response itself never becomes a bandwidth-bound measurement.
export async function GET() {
  return NextResponse.json({}, { headers: { 'Cache-Control': 'no-store' } });
}
