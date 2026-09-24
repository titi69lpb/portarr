import { NextRequest, NextResponse } from 'next/server';
import { loadConfig } from '@/lib/config';
import { getDb } from '@/lib/db';
import { verifyUnsubscribeToken } from '@/lib/newsletter-token';
import { setSubscribed } from '@/lib/newsletter-subscriptions';
import { t } from '@/lib/i18n/translate';
import { getInstanceLocale, getLocaleByIdentity } from '@/lib/i18n/locale';
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n/dictionaries';

export const dynamic = 'force-dynamic';

// Locale: the token owner's personal preference, else the instance default
// (Accept-Language only when first-run setup enabled locale_auto). Never
// throws: a failure to resolve falls back to the default locale.
function resolveLocale(request: NextRequest, ref: { provider: string; userId: string } | null): Locale {
  try {
    const db = getDb();
    const accept = request.headers.get('accept-language');
    return ref ? getLocaleByIdentity(ref.provider, ref.userId, db, accept) : getInstanceLocale(db, accept);
  } catch {
    return DEFAULT_LOCALE;
  }
}

function htmlPage(locale: Locale, body: string, status: number = 200): NextResponse {
  return new NextResponse(
    `<!DOCTYPE html><html lang="${locale}"><body style="font-family:sans-serif;text-align:center;padding:40px;">${body}</body></html>`,
    { status, headers: { 'Content-Type': 'text/html' } }
  );
}

function errorPage(locale: Locale, key: string, status: number): NextResponse {
  return htmlPage(locale, `<p>${t(locale, key)}</p>`, status);
}

// GET only shows a confirmation page — it must never mutate state on its own.
// Mail clients and corporate security gateways (Outlook SafeLinks, spam
// scanners) prefetch links found in email automatically; a state-changing
// GET here would silently unsubscribe people who never clicked anything.
// The actual unsubscribe happens on POST, triggered by a real click on this
// page's own button.
export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token');
    if (!token) {
      return errorPage(resolveLocale(request, null), 'newsletter.unsubscribeInvalidLink', 400);
    }

    const config = loadConfig(process.env, getDb());
    const ref = await verifyUnsubscribeToken(token, config.session.secret);
    if (!ref) {
      return errorPage(resolveLocale(request, null), 'newsletter.unsubscribeExpired', 400);
    }

    const locale = resolveLocale(request, ref);
    return htmlPage(locale, `
      <p>${t(locale, 'newsletter.unsubscribeConfirm')}</p>
      <form method="POST" action="/api/newsletter/unsubscribe">
        <input type="hidden" name="token" value="${token}" />
        <button type="submit" style="padding:8px 20px;font-size:14px;cursor:pointer;">${t(locale, 'newsletter.unsubscribeButton')}</button>
      </form>
    `);
  } catch (err) {
    console.error('Failed to process unsubscribe request:', err);
    return errorPage(resolveLocale(request, null), 'newsletter.unsubscribeError', 502);
  }
}

export async function POST(request: NextRequest) {
  try {
    let token: string | null;
    const contentType = request.headers.get('content-type') ?? '';
    if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      token = formData.get('token')?.toString() ?? null;
    } else {
      token = request.nextUrl.searchParams.get('token');
    }

    if (!token) {
      return errorPage(resolveLocale(request, null), 'newsletter.unsubscribeInvalidLink', 400);
    }

    const config = loadConfig(process.env, getDb());
    const ref = await verifyUnsubscribeToken(token, config.session.secret);
    if (!ref) {
      return errorPage(resolveLocale(request, null), 'newsletter.unsubscribeExpired', 400);
    }

    const db = getDb();
    setSubscribed(db, ref, false);

    const locale = resolveLocale(request, ref);
    return htmlPage(locale, `<p>${t(locale, 'newsletter.unsubscribeDone')}</p>`);
  } catch (err) {
    console.error('Failed to process unsubscribe request:', err);
    return errorPage(resolveLocale(request, null), 'newsletter.unsubscribeError', 502);
  }
}
