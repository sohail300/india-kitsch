import { ResendClient } from "./resend";

/**
 * Swappable email sender (docs/01 §2: "Resend behind an EmailSender
 * interface, swappable"). Phase 8 adds `createResendEmailSender` alongside
 * the Phase 3 console driver - nothing that calls `emailSender.send` had
 * to change.
 *
 * No `import "server-only"` here, deliberately: this module is imported by
 * `server/auth/config.ts`, which is itself unguarded so
 * `scripts/create-admin.ts` can build its own auth instance under plain
 * tsx (see config.ts's own comment). That's also why the real sender below
 * reads `process.env` directly instead of importing the guarded `env.ts` -
 * same reasoning as `db/client.ts`'s split for `seed.ts`.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  /** A plain-text fallback - required, not derived from `html`, since a good text version reads differently (no markup to strip) rather than worse. */
  text: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

/**
 * Logs instead of sending - used whenever `RESEND_API_KEY` isn't set.
 * Deliberately loud (easy to spot in logs) so a real send is never
 * silently skipped without anyone noticing.
 */
export const consoleEmailSender: EmailSender = {
  async send(message) {
    console.log(
      `[email:not-yet-sent] to=${message.to} subject="${message.subject}"\n${message.text}`,
    );
  },
};

export function createResendEmailSender(client: ResendClient, from: string): EmailSender {
  return {
    async send(message) {
      await client.sendEmail({
        from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
    },
  };
}

const resendApiKey = process.env.RESEND_API_KEY;
const emailFrom = process.env.EMAIL_FROM || "orders@example.com";
const supportEmailFrom = process.env.SUPPORT_EMAIL_FROM || "support@example.com";
// Both `EMAIL_FROM`/`SUPPORT_EMAIL_FROM` stay bare addresses (env.ts
// validates each with z.email()) - the display name is added here, at the
// one place each "From" header is actually built, not baked into the env
// vars themselves.
const emailFromWithName = `India Kitsch <${emailFrom}>`;
const supportEmailFromWithName = `India Kitsch <${supportEmailFrom}>`;

/** The real sender: Resend once `RESEND_API_KEY` is set (an empty string counts as unset, same convention as env.ts's `stripEmptyStrings`), the console driver until then. */
export const emailSender: EmailSender = resendApiKey
  ? createResendEmailSender(new ResendClient({ apiKey: resendApiKey }), emailFromWithName)
  : consoleEmailSender;

/** Account/security emails only (verify, reset password) - a customer may
 * genuinely need to reply/get help with these, unlike order notifications,
 * so they send from `SUPPORT_EMAIL_FROM` instead of `EMAIL_FROM`. */
export const authEmailSender: EmailSender = resendApiKey
  ? createResendEmailSender(new ResendClient({ apiKey: resendApiKey }), supportEmailFromWithName)
  : consoleEmailSender;
