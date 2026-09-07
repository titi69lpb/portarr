import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getNewsletterArchive } from '@/lib/newsletter-archive';

export const dynamic = 'force-dynamic';

function notFoundPage(): NextResponse {
  return new NextResponse(
    `<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:40px;"><p>Cette newsletter n'existe pas ou n'est plus disponible.</p></body></html>`,
    { status: 404, headers: { 'Content-Type': 'text/html' } }
  );
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id);
    if (!Number.isInteger(id)) {
      return notFoundPage();
    }

    const db = getDb();
    const archive = getNewsletterArchive(db, id);
    if (!archive) {
      return notFoundPage();
    }

    return new NextResponse(archive.html, { headers: { 'Content-Type': 'text/html' } });
  } catch (err) {
    console.error('Failed to load newsletter archive:', err);
    return notFoundPage();
  }
}
