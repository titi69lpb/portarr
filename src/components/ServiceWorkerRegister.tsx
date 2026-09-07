'use client';

import { useEffect } from 'react';

// Registers /sw.js on mount — see that file for why it exists (installability
// only, no caching). Silently no-ops if the browser doesn't support service
// workers or registration fails; this must never block or error the app.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.error('Service worker registration failed:', err);
      });
    }
  }, []);
  return null;
}
