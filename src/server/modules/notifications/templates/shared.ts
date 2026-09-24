/**
 * Shared rendering helpers for every template — deliberately no
 * `import "server-only"` and no dependency on anything that has one
 * (e.g. `lib/money.ts`): `auth.ts` in this directory is imported by
 * `server/auth/config.ts`, which must stay importable under plain tsx for
 * `scripts/create-admin.ts` (see config.ts's own comment). `server-only`
 * throws unconditionally under plain Node, not just in a browser context —
 * confirmed directly, not assumed — so anything in this file's import
 * chain has to stay clear of it.
 */

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderLayout(bodyHtml: string): string {
  return `<!doctype html>
<html>
  <body style="font-family: -apple-system, Helvetica, Arial, sans-serif; background:#f6f6f6; margin:0; padding:24px;">
    <table role="presentation" width="100%" style="max-width:560px; margin:0 auto; background:#ffffff; border-radius:8px;">
      <tr><td style="padding:32px;">
        <h1 style="font-size:18px; margin:0 0 16px;">India Kitsch</h1>
        ${bodyHtml}
      </td></tr>
    </table>
  </body>
</html>`;
}

export function button(url: string, label: string): string {
  return `<p><a href="${url}" style="display:inline-block; background:#111111; color:#ffffff; padding:10px 20px; border-radius:4px; text-decoration:none;">${escapeHtml(label)}</a></p>`;
}
