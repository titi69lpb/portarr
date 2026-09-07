import './globals.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Bebas_Neue, Manrope, IBM_Plex_Mono } from 'next/font/google';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';

/** Display face — poster/marquee lettering. Eyebrows, wordmark, big numbers only. */
const bebasNeue = Bebas_Neue({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  variable: '--font-display',
});

/** Body face — everything readable: paragraphs, buttons, labels, nav. */
const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-body',
});

/** Utility face — numeric stats, dates, admin content preview. */
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'Portarr',
  // manifest.ts (App Router convention) already auto-links /manifest.webmanifest —
  // appleWebApp is here because iOS Safari ignores the web manifest for "Add to
  // Home Screen" and needs its own meta tags to behave as an installed app
  // (standalone chrome, no browser UI) instead of just a bookmarked tab.
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Portarr',
  },
};

export const viewport: Viewport = {
  themeColor: '#14110F',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="fr"
      className={`${bebasNeue.variable} ${manrope.variable} ${ibmPlexMono.variable}`}
    >
      <body className="min-h-screen bg-plexcrew-ink font-sans text-plexcrew-screen antialiased">
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
