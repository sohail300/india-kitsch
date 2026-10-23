import { Heading, renderEmail } from "./shared";
import type { RenderedEmail } from "./shared";

export type { RenderedEmail };

/**
 * Owner-facing, not customer-facing — distinct from the 6 named templates
 * Phase 8 built. Sent to `env.CONTACT_INBOX_EMAIL` (the same real, owner-
 * monitored inbox the contact form uses, docs/11 §29 #7 — never a separate
 * fabricated address) whenever the reconciler finds something needing a
 * human look: an amount mismatch, a captured payment it couldn't reinstate
 * or auto-refund, a late-payment auto-refund worth a sanity check.
 */
export async function reconcileAlertTemplate(alerts: string[]): Promise<RenderedEmail> {
  const subject = `Reconciler needs attention (${alerts.length} item${alerts.length === 1 ? "" : "s"})`;
  return renderEmail(
    subject,
    <>
      <Heading>Payment reconciler alert</Heading>
      <p style={{ margin: "0 0 12px" }}>
        The 10-minute reconciler found {alerts.length} item{alerts.length === 1 ? "" : "s"} needing
        a human look:
      </p>
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        {alerts.map((alert, i) => (
          <li key={i} style={{ marginBottom: 6 }}>
            {alert}
          </li>
        ))}
      </ul>
    </>,
  );
}
