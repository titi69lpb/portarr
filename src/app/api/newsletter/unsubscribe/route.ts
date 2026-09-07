import { NextRequest, NextResponse } from 'next/server';
import { loadConfig } from '@/lib/config';
import { getDb } from '@/lib/db';
import { verifyUnsubscribeToken } from '@/lib/newsletter-token';
import { setSubscribed } from '@/lib/newsletter-subscriptions';

export const dynamic = 'force-dynamic';

function htmlPage(body: string, status: number = 200): NextResponse {
  return new NextResponse(
    `<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:40px;">${body}</body></html>`,
    { status, headers: { 'Content-Type': 'text/html' } }
  );
}

function errorPage(message: string, status: number): NextResponse {
  return htmlPage(`<p>${message}</p>`, status);
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
      return errorPage('Lien invalide.', 400);
    }

    const config = loadConfig();
    const plexId = await verifyUnsubscribeToken(token, config.session.secret);
    if (!plexId) {
      return errorPage('Lien invalide ou expiré.', 400);
    }

    return htmlPage(`
      <p>Se désabonner de la newsletter Portarr ?</p>
      <form method="POST" action="/api/newsletter/unsubscribe">
        <input type="hidden" name="token" value="${token}" />
        <button type="submit" style="padding:8px 20px;font-size:14px;cursor:pointer;">Se désabonner</button>
      </form>
    `);
  } catch (err) {
    console.error('Failed to process unsubscribe request:', err);
    return errorPage('Une erreur est survenue.', 502);
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
      return errorPage('Lien invalide.', 400);
    }

    const config = loadConfig();
    const plexId = await verifyUnsubscribeToken(token, config.session.secret);
    if (!plexId) {
      return errorPage('Lien invalide ou expiré.', 400);
    }

    const db = getDb();
    setSubscribed(db, plexId, false);

    return htmlPage('<p>Vous avez été désabonné de la newsletter.</p>');
  } catch (err) {
    console.error('Failed to process unsubscribe request:', err);
    return errorPage('Une erreur est survenue.', 502);
  }
}
