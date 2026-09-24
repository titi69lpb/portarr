import './globals.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import type Database from 'better-sqlite3';
import { Bebas_Neue, Manrope, IBM_Plex_Mono } from 'next/font/google';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';
import { getDb } from '@/lib/db';
import { loadConfig, isSetupComplete, type AppConfig } from '@/lib/config';
import { getOrCreateSetupToken } from '@/lib/setup';
import { verifySession, SESSION_COOKIE_NAME } from '@/lib/session';
import { getRequestLocale } from '@/lib/i18n/request-locale';

// The root layout is the one place guaranteed to run on every request to
// every page (unlike middleware.ts, which explicitly cannot touch the DB —
// see the comment there — and unlike individual page.tsx files, most but
// not all of which opt into per-request rendering on their own). Forcing
// it dynamic here is what lets the boot-log below actually fire; the only
// route this changes from static to dynamic is /login, which was already
// gated behind session/DB checks in practice.
export const dynamic = 'force-dynamic';

// Logs the one-time setup URL to stdout so a self-hoster running
// `docker logs` can find it — src/app/setup/page.tsx's own fallback UI
// tells visitors to look here. Guarded at module scope so it prints at
// most once per process (not once per request), and only while setup is
// genuinely incomplete.
let setupTokenLogged = false;

function logSetupTokenOnce(config: AppConfig, db: Database.Database): void {
  if (setupTokenLogged || isSetupComplete(config)) return;
  setupTokenLogged = true;
  const token = getOrCreateSetupToken(db);
  const url = `${config.publicBaseUrl ?? 'http://localhost:3000'}/setup?token=${token}`;
  console.log(`\n=== Portarr — configuration initiale requise ===\nOuvrez : ${url}\n`);
}

/** Display face — poster/marquee lettering. Eyebrows, wordmark, big numbers only. */
const bebasNeue = Bebas_Neue({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  variable: '--font-display',
  // Only page.tsx's hero heading uses this face — most routes (admin, files,
  // profile) never render it above the fold, so eagerly preloading it there
  // trips Chrome's "preloaded but not used within a few seconds" warning.
  preload: false,
});

/** Body face — everything readable: paragraphs, buttons, labels, nav. */
const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-body',
  // 4 weight files declared but most routes only render a subset within the
  // first few seconds — same over-eager-preload issue as bebasNeue below.
  preload: false,
});

/** Utility face — numeric stats, dates, admin content preview. */
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-mono',
  // Only used by specific widgets (stats, file sizes, release dates) — not
  // guaranteed to render on every route, so don't force-preload it either.
  preload: false,
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
  // Chrome deprecated bare reliance on apple-mobile-web-app-capable and now
  // warns unless the standard (non-prefixed) tag is present too — Next's
  // Metadata.appleWebApp only emits the apple-* tags, so this one needs
  // adding by hand via `other`. Keep both: iOS Safari still only reads the
  // apple-prefixed ones.
  other: {
    'mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  themeColor: '#14110F',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const db = getDb();
  const config = loadConfig(process.env, db);
  logSetupTokenOnce(config, db);

  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  const sessionUser = token ? await verifySession(token, config.session.secret) : null;
  const locale = getRequestLocale(sessionUser, db);

  return (
    <html
      lang={locale}
      className={`${bebasNeue.variable} ${manrope.variable} ${ibmPlexMono.variable}`}
    >
      <body className="min-h-screen bg-plexcrew-ink font-sans text-plexcrew-screen antialiased">
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
