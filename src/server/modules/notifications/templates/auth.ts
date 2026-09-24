import { button, escapeHtml, renderLayout } from "./shared";
import type { RenderedEmail } from "./shared";

export type { RenderedEmail };

export function verifyEmailTemplate(name: string, url: string): RenderedEmail {
  const subject = "Verify your email — India Kitsch";
  const html = renderLayout(`
    <p>Hi ${escapeHtml(name)},</p>
    <p>Confirm your email address to finish setting up your account.</p>
    ${button(url, "Verify email")}
    <p>Or paste this link into your browser: ${escapeHtml(url)}</p>
  `);
  const text = `Hi ${name},\n\nConfirm your email address: ${url}\n\nIf you didn't create this account, you can ignore this email.`;
  return { subject, html, text };
}

export function resetPasswordTemplate(name: string, url: string): RenderedEmail {
  const subject = "Reset your India Kitsch password";
  const html = renderLayout(`
    <p>Hi ${escapeHtml(name)},</p>
    <p>We received a request to reset your password.</p>
    ${button(url, "Reset password")}
    <p>If you didn't request this, you can ignore this email — your password won't change.</p>
  `);
  const text = `Hi ${name},\n\nReset your password: ${url}\n\nIf you didn't request this, ignore this email.`;
  return { subject, html, text };
}
