import type { MetadataRoute } from 'next';

// Next.js App Router convention: this file is auto-served at /manifest.webmanifest
// and auto-linked in <head> — no manual <link rel="manifest"> needed.
//
// Only one square source image is available (public/logo.png, 512x512) — no
// image tooling in this environment to derive a proper 192x192 asset, so both
// declared sizes point at the same 512 file. Not spec-perfect but functionally
// fine: browsers downscale it for the smaller install-prompt/home-screen slot.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Portarr',
    short_name: 'Portarr',
    description: 'Portail Portarr — dashboard, demandes, explorateur de fichiers, historique',
    start_url: '/',
    display: 'standalone',
    background_color: '#14110F',
    theme_color: '#14110F',
    icons: [
      { src: '/logo.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/logo.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    ],
  };
}
