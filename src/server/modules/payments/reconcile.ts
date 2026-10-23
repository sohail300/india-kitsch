import "server-only";
import { db } from "@/server/db/client";
import type { Db } from "@/server/db/client";
import { emailSender as defaultEmailSender } from "@/server/lib/email";
import type { EmailSender } from "@/server/lib/email";
import { env } from "@/server/lib/env";
import { logger } from "@/server/lib/logger";
import { cancelPendingOrder } from "@/server/modules/orders/service";
import {
  getExpiredCancelledOrdersSince,
  getExpiredPendingOrders,
} from "@/server/modules/orders/queries";
import { reconcileAlertTemplate } from "@/server/modules/notifications/templates/internal";
import { createRazorpayClient } from "./razorpay";
import type { RazorpayClient, RazorpayPayment } from "./razorpay";
import { settleCapturedPayment } from "./settle";

/**
 * How far back to look for a late payment against an already-cancelled
 * order (docs/06 §9 step 7). Not specified in docs - a payment completing
 * more than a day after a 5-minute hold expired is unlikely enough that a
 * later one is a support case, not something to keep auto-checking
 * forever. A judgment call, easy to change if it turns out too short.
 */
const LATE_PAYMENT_LOOKBACK_HOURS = 24;

export interface ReconcileResult {
  expiredChecked: number;
  markedPaid: number;
  cancelled: number;
  latePaymentChecked: number;
  latePaymentReinstated: number;
  latePaymentRefunded: number;
  /** Anything that needs a human: amount mismatches, a captured payment that
   * couldn't be reinstated or auto-refunded. Always logged; also emailed to
   * `env.CONTACT_INBOX_EMAIL` (best-effort — see the email try/catch below),
   * distinct from the 6 customer-facing templates Phase 8 built. */
  alerts: string[];
}

function findCapturedPayment(payments: RazorpayPayment[]): RazorpayPayment | undefined {
  return payments.find((p) => p.status === "captured");
}

/**
 * The reconciler's full sweep (docs/06 §9 step 7), run every 10 minutes by
 * the cron Worker hitting `/api/cron/reconcile`. Two independent passes -
 * lost-webhook recovery for expired `pending_payment` orders, and
 * late-payment detection for orders already auto-cancelled - both just
 * call `settleCapturedPayment` (shared with the webhook handler, docs/12
 * "One doc gap to close before Phase 6 code"): this sweep exists to catch
 * whatever the webhook *didn't* already handle, not to duplicate its logic.
 */
export async function reconcileExpiredOrders(
  dbHandle: Db = db,
  razorpay: RazorpayClient = createRazorpayClient(),
  now: Date = new Date(),
  emailSender: EmailSender = defaultEmailSender,
): Promise<ReconcileResult> {
  const alerts: string[] = [];
  let markedPaid = 0;
  let cancelled = 0;
  let latePaymentReinstated = 0;
  let latePaymentRefunded = 0;

  const expired = await getExpiredPendingOrders(now, dbHandle);
  for (const order of expired) {
    if (!order.razorpayOrderId) {
      alerts.push(
        `Order ${order.id} is pending_payment and expired but has no razorpayOrderId - data bug`,
      );
      continue;
    }
    try {
      const { items } = await razorpay.fetchOrderPayments(order.razorpayOrderId);
      const captured = findCapturedPayment(items);

      if (!captured) {
        await dbHandle.transaction((tx) =>
          cancelPendingOrder(tx, { orderId: order.id, reason: "expired", actor: "system" }),
        );
        cancelled++;
        continue;
      }

      const outcome = await settleCapturedPayment(
        order,
        captured,
        "system",
        dbHandle,
        razorpay,
        emailSender,
      );
      if (outcome === "paid") markedPaid++;
      else if (outcome === "amount_mismatch") {
        alerts.push(
          `Order ${order.id}: captured payment ${captured.id} amount/currency doesn't match the order`,
        );
      }
    } catch (error) {
      alerts.push(
        `Order ${order.id}: reconcile check failed - ${error instanceof Error ? error.message : String(error)}`,
      );
      logger.error("reconcile: expired-order check failed", { orderId: order.id, error });
    }
  }

  const since = new Date(now.getTime() - LATE_PAYMENT_LOOKBACK_HOURS * 60 * 60_000);
  const cancelledOrders = await getExpiredCancelledOrdersSince(since, dbHandle);

  for (const order of cancelledOrders) {
    try {
      const { items } = await razorpay.fetchOrderPayments(order.razorpayOrderId!);
      const captured = findCapturedPayment(items);
      if (!captured) continue; // the normal case - nothing to reconcile (the webhook likely already handled it, or there's genuinely no late payment)

      const outcome = await settleCapturedPayment(
        order,
        captured,
        "system",
        dbHandle,
        razorpay,
        emailSender,
      );
      if (outcome === "reinstated") {
        latePaymentReinstated++;
      } else if (outcome === "refunded") {
        latePaymentRefunded++;
        alerts.push(
          `Order ${order.id}: late payment auto-refunded (customer already emailed) - worth an owner sanity check`,
        );
      } else if (outcome === "amount_mismatch") {
        alerts.push(
          `Order ${order.id}: late captured payment ${captured.id} amount/currency mismatch - manual review needed`,
        );
      }
      // "not_applicable" here means the webhook already settled it since this sweep started reading - nothing to do.
    } catch (error) {
      alerts.push(
        `Order ${order.id}: late-payment check failed - ${error instanceof Error ? error.message : String(error)}`,
      );
      logger.error("reconcile: late-payment check failed", { orderId: order.id, error });
    }
  }

  for (const alert of alerts) {
    logger.warn("reconcile: needs attention", { alert });
  }

  // Best-effort: a failed alert email must never fail the reconciler run
  // itself, or hide the alerts from its own JSON response/logs above.
  if (alerts.length > 0) {
    try {
      const email = await reconcileAlertTemplate(alerts);
      await emailSender.send({ to: env.CONTACT_INBOX_EMAIL, ...email });
    } catch (error) {
      logger.error("reconcile: failed to send owner alert email", { error });
    }
  }

  return {
    expiredChecked: expired.length,
    markedPaid,
    cancelled,
    latePaymentChecked: cancelledOrders.length,
    latePaymentReinstated,
    latePaymentRefunded,
    alerts,
  };
}
