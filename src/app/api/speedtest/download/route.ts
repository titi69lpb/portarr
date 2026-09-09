import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { MAX_DOWNLOAD_BYTES } from '@/lib/speedtest';

export const dynamic = 'force-dynamic';

const CHUNK_BYTES = 64 * 1024;

// Random bytes, not zeros: a zero-filled buffer compresses near-instantly
// under any transparent gzip (proxy, browser dev tools override, etc.) and
// would make the measured "download speed" reflect compression, not the
// actual link. Generated on the fly — never read from or written to disk.
export async function GET(request: NextRequest) {
  const sizeParam = request.nextUrl.searchParams.get('size');
  const requested = sizeParam ? Number(sizeParam) : NaN;
  if (!Number.isFinite(requested) || requested <= 0) {
    return NextResponse.json(
      { error: 'invalid size' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const size = Math.min(Math.floor(requested), MAX_DOWNLOAD_BYTES);
  let sent = 0;

  const stream = new ReadableStream({
    pull(controller) {
      const remaining = size - sent;
      if (remaining <= 0) {
        controller.close();
        return;
      }
      const chunkSize = Math.min(CHUNK_BYTES, remaining);
      controller.enqueue(randomBytes(chunkSize));
      sent += chunkSize;
    },
  });

  return new NextResponse(stream, {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(size),
      'Cache-Control': 'no-store',
    },
  });
}
