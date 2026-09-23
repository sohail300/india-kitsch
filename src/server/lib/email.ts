/**
 * Swappable email sender (docs/01 §2: "Resend behind an EmailSender
 * interface, swappable"). Phase 8 (email/notifications backend) swaps
 * `consoleEmailSender` for a real Resend-backed implementation without
 * anything that calls `sendEmail` needing to change.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

/**
 * Logs instead of sending — what every environment uses until Phase 8.
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

// TODO(Phase 8): export a Resend-backed EmailSender here and switch
// server/auth/config.ts (and anything else that sends email) to use it.
export const emailSender: EmailSender = consoleEmailSender;
