import { NextRequest, NextResponse } from 'next/server';
import { loadConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';

const VALID_PATH = /^\/library\/metadata\/\d+\/thumb\/\d+$/;

// A themed "no poster" placeholder, returned with a 200 whenever the
// underlying Plex item can't be fetched — e.g. a stats/history entry
// pointing at media that has since been deleted (a real, recurring case
// after the NAS storage incident). Every consumer is a Server Component
// with no onError fallback (see the NowPlaying Client Component incident
// this session), so this has to be a real, always-successful image
// response — not a 404/502 that would render as a broken-image glyph.
//
// Kept deliberately simple: this renders as small as 24x36px in some list
// rows (StatCard), where fine detail or text just blurs into a dark blob.
// A lighter-than-black fill plus one bold, high-contrast glyph is what
// actually reads as "intentional placeholder" rather than "broken" at
// every size this proxy is used at, from a 24px-tall list row up to a
// full poster card.
const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300">
  <rect width="200" height="300" fill="#2A241E"/>
  <path d="M 78 110 L 78 190 L 138 150 Z" fill="#E2A33B"/>
</svg>`;

function placeholderPosterResponse(): NextResponse {
  return new NextResponse(PLACEHOLDER_SVG, {
    status: 200,
    headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600' },
  });
}

export async function GET(request: NextRequest) {
  try {
    const path = request.nextUrl.searchParams.get('path');
    if (!path || !VALID_PATH.test(path)) {
      // Same degrade-to-placeholder contract as an upstream failure below: every
      // consumer is a Server Component with no onError fallback, so an error
      // status here would render as a broken-image glyph instead of a blank one.
      return placeholderPosterResponse();
    }

    const config = loadConfig();
    // Request a resized copy from Plex's own photo transcoder instead of the
    // raw thumb — the raw file is the full source poster (seen in practice:
    // 2000x3000, ~1.5MB) while every consumer here renders it at a few
    // hundred CSS pixels at most. 300x450 covers every current call site
    // (including retina) at a fraction of the weight.
    const transcodeUrl =
      `${config.plex.url}/photo/:/transcode?width=300&height=450&minSize=1&upscale=0` +
      `&url=${encodeURIComponent(path)}&X-Plex-Token=${config.plex.serverToken}`;
    const res = await fetch(transcodeUrl);
    if (!res.ok) {
      return placeholderPosterResponse();
    }

    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    const bytes = await res.arrayBuffer();
    return new NextResponse(bytes, {
      status: 200,
      headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=86400, immutable' },
    });
  } catch (err) {
    console.error('Failed to proxy newsletter poster:', err);
    return placeholderPosterResponse();
  }
}
