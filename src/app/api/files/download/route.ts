import { NextRequest, NextResponse } from 'next/server';
import { stat as statAsync } from 'fs/promises';
import { createReadStream } from 'fs';
import { Readable } from 'stream';
import { loadConfig } from '@/lib/config';
import {
  resolveSafePath,
  withTimeout,
  UnsafePathError,
  UpstreamUnavailableError,
} from '@/lib/file-explorer';
import { buildSignedDownloadUrl } from '@/lib/sign-download-url';
import { parseRange, isUnsatisfiableRange, buildContentDispositionHeader } from '@/lib/download-headers';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const config = loadConfig();

  if (!config.filesRootPath) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const relativePath = request.nextUrl.searchParams.get('path') ?? '';

  let resolved: string;
  try {
    resolved = await resolveSafePath(config.filesRootPath, relativePath, config.fsTimeoutMs);
  } catch (err) {
    if (err instanceof UnsafePathError) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    if (err instanceof UpstreamUnavailableError) {
      return NextResponse.json({ error: 'service unavailable' }, { status: 503 });
    }
    throw err;
  }

  let stats;
  try {
    stats = await withTimeout(statAsync(resolved), config.fsTimeoutMs, `stat(${resolved})`);
  } catch {
    return NextResponse.json({ error: 'service unavailable' }, { status: 503 });
  }
  if (stats.isDirectory()) {
    return NextResponse.json({ error: 'cannot download a directory' }, { status: 400 });
  }

  // WireGuard-bypass pattern: when a proxy is configured, redirect to a
  // signed URL on it instead of streaming the file through this process.
  // Without one, fall back to serving the file directly (Step below).
  if (config.downloadProxyUrl && config.downloadSigningSecret) {
    const url = buildSignedDownloadUrl(relativePath, config.downloadSigningSecret, config.downloadProxyUrl);
    return NextResponse.redirect(url, 302);
  }

  const fileName = resolved.split('/').pop() ?? 'download';
  const rangeHeader = request.headers.get('range');
  const range = parseRange(rangeHeader, stats.size);

  if (!range && isUnsatisfiableRange(rangeHeader, stats.size)) {
    return new NextResponse(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${stats.size}` },
    });
  }

  const headers: Record<string, string> = {
    'Content-Disposition': buildContentDispositionHeader(fileName),
    'Accept-Ranges': 'bytes',
    'Content-Type': 'application/octet-stream',
  };

  if (range) {
    headers['Content-Range'] = `bytes ${range.start}-${range.end}/${stats.size}`;
    headers['Content-Length'] = String(range.end - range.start + 1);
    const nodeStream = createReadStream(resolved, { start: range.start, end: range.end });
    return new NextResponse(Readable.toWeb(nodeStream) as unknown as ReadableStream, {
      status: 206,
      headers,
    });
  }

  headers['Content-Length'] = String(stats.size);
  const nodeStream = createReadStream(resolved);
  return new NextResponse(Readable.toWeb(nodeStream) as unknown as ReadableStream, {
    status: 200,
    headers,
  });
}
