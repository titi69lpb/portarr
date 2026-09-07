// Shared HTML email shell — brings the portal's "Marquee" theme (dark ink/charcoal,
// amber accent, serif display masthead) into outbound mail. Email clients don't
// reliably support external fonts, flexbox, or CSS backgrounds on arbitrary
// elements, so the outer structure below intentionally uses table layout with
// inline styles (the traditionally fragile part across clients); a <style> block
// in <head> is used only for the caller-supplied body content (Markdown-rendered
// HTML, or a poster grid), which targets a small, known, modern-client audience
// (Gmail/Apple Mail/Outlook web) rather than legacy desktop Outlook.
export function renderEmailShell(bodyHtml: string, publicBaseUrl: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  body { margin: 0; padding: 0; }
  .pc-body h1, .pc-body h2, .pc-body h3 {
    font-family: Georgia, 'Times New Roman', serif;
    color: #EFE9DF;
    margin: 0 0 12px;
  }
  .pc-body h1 { font-size: 22px; }
  .pc-body h2 { font-size: 18px; color: #E2A33B; }
  .pc-body h3 { font-size: 15px; }
  .pc-body p { margin: 0 0 14px; color: #EFE9DF; }
  .pc-body a { color: #E2A33B; }
  .pc-body ul, .pc-body ol { margin: 0 0 14px; padding-left: 20px; color: #EFE9DF; }
  .pc-body li { margin-bottom: 4px; }
  .pc-body strong { color: #EFE9DF; }
  .pc-body blockquote {
    margin: 0 0 14px;
    padding-left: 12px;
    border-left: 3px solid #2F6E63;
    color: #8C8378;
  }
  .pc-body img { max-width: 100%; border-radius: 4px; }
</style>
</head>
<body style="background-color:#14110F;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#14110F;padding:24px 0;">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#211C18;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="background-color:#14110F;padding:20px 32px;border-bottom:3px solid #E2A33B;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td valign="middle" style="width:40px;">
                  <img src="${publicBaseUrl}/logo.png" width="32" height="32" alt="" style="display:block;border-radius:4px;" />
                </td>
                <td valign="middle" style="padding-left:12px;">
                  <span style="color:#EFE9DF;font-family:Georgia, 'Times New Roman', serif;font-size:20px;font-weight:bold;letter-spacing:0.08em;text-transform:uppercase;">Portarr</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td class="pc-body" style="padding:32px;font-family:Arial, Helvetica, sans-serif;font-size:15px;line-height:1.6;">
            ${bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="background-color:#14110F;padding:16px 32px;text-align:center;">
            <span style="color:#8C8378;font-family:Arial, Helvetica, sans-serif;font-size:11px;">Portarr — portail communautaire</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
