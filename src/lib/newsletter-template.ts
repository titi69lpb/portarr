import type { NewsletterItems } from './newsletter';
import type { RecentlyAddedItem } from './plex';
import { renderEmailShell } from './email-template';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderItem(item: RecentlyAddedItem, posterBaseUrl: string): string {
  const posterUrl = `${posterBaseUrl}?path=${encodeURIComponent(item.thumbPath)}`;
  return `
    <td style="padding:6px;vertical-align:top;width:33%;">
      <img src="${posterUrl}" alt="${escapeHtml(item.title)}" width="150" style="display:block;width:100%;max-width:150px;border-radius:6px;border:1px solid #2F6E63;" />
      <p style="font-size:13px;color:#EFE9DF;margin:6px 0 0;text-align:center;">${escapeHtml(item.title)}</p>
    </td>`;
}

function renderGrid(items: RecentlyAddedItem[], posterBaseUrl: string): string {
  const rows: string[] = [];
  for (let i = 0; i < items.length; i += 3) {
    const rowItems = items.slice(i, i + 3);
    const cells = rowItems.map((item) => renderItem(item, posterBaseUrl)).join('');
    const padding = 3 - rowItems.length;
    const emptyCells = Array.from({ length: padding }, () => '<td style="padding:6px;width:33%;"></td>').join('');
    rows.push(`<tr>${cells}${emptyCells}</tr>`);
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.join('')}</table>`;
}

export function renderNewsletterHtml(
  items: NewsletterItems,
  serverName: string,
  endDate: string,
  posterBaseUrl: string,
  unsubscribeUrl: string,
  publicBaseUrl: string,
  archiveUrl?: string
): string {
  const sections: string[] = [
    `<h1 style="font-family:Georgia, 'Times New Roman', serif;color:#EFE9DF;font-size:22px;margin:0 0 4px;">Les Nouveautés ${escapeHtml(serverName)} !</h1>`,
    `<p style="color:#8C8378;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 24px;">${escapeHtml(endDate)}` +
      (archiveUrl
        ? ` &middot; <a href="${archiveUrl}" style="color:#8C8378;text-transform:none;letter-spacing:normal;">Voir dans le navigateur</a>`
        : '') +
      `</p>`,
  ];

  if (items.movies.length > 0) {
    sections.push(
      `<h2 style="color:#E2A33B;font-family:Georgia, 'Times New Roman', serif;font-size:16px;text-transform:uppercase;letter-spacing:0.06em;border-bottom:1px solid #2F6E63;padding-bottom:6px;margin:0 0 12px;">🎬 Films</h2>`,
      renderGrid(items.movies, posterBaseUrl)
    );
  }

  if (items.episodes.length > 0) {
    sections.push(
      `<h2 style="color:#E2A33B;font-family:Georgia, 'Times New Roman', serif;font-size:16px;text-transform:uppercase;letter-spacing:0.06em;border-bottom:1px solid #2F6E63;padding-bottom:6px;margin:24px 0 12px;">📺 Séries</h2>`,
      renderGrid(items.episodes, posterBaseUrl)
    );
  }

  sections.push(
    `<p style="font-size:11px;color:#8C8378;margin-top:28px;border-top:1px solid #2F6E63;padding-top:16px;">` +
      `<a href="${unsubscribeUrl}" style="color:#8C8378;">Se désabonner de cette newsletter</a></p>`
  );

  return renderEmailShell(sections.join(''), publicBaseUrl);
}
