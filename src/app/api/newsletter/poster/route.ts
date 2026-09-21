import { NextRequest, NextResponse } from 'next/server';
import { loadConfig, assertConfigured } from '@/lib/config';
import { getDb } from '@/lib/db';
import { getActiveProviders } from '@/lib/media/registry';

export const dynamic = 'force-dynamic';

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
    const ref = request.nextUrl.searchParams.get('path');
    if (!ref) {
      return placeholderPosterResponse();
    }

    // Pre-setup (or Plex not configured), assertConfigured throws — caught
    // below and degraded to the same placeholder as any other upstream
    // failure, which is exactly the right behavior for this route.
    const config = assertConfigured(loadConfig(process.env, getDb()));

    // Each provider recognizes only its own poster refs (Plex thumb paths,
    // Jellyfin `jellyfin:<id>`); a ref nobody handles is malformed or foreign.
    // Same degrade-to-placeholder contract as an upstream failure: every
    // consumer is a Server Component with no onError fallback, so an error
    // status here would render as a broken-image glyph instead of a blank one.
    const provider = getActiveProviders(config).find((p) => p.handlesPoster(ref));
    if (!provider) {
      return placeholderPosterResponse();
    }

    const poster = await provider.poster(ref);
    if (!poster) {
      return placeholderPosterResponse();
    }

    return new NextResponse(poster.bytes, {
      status: 200,
      headers: { 'Content-Type': poster.contentType, 'Cache-Control': 'public, max-age=86400, immutable' },
    });
  } catch (err) {
    console.error('Failed to proxy newsletter poster:', err);
    return placeholderPosterResponse();
  }
}
