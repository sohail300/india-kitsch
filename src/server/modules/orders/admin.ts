import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import type { Db } from "@/server/db/client";
import { orders, payments, refunds } from "@/server/db/schema";
import { NotFoundError } from "@/server/lib/errors";
import { emailSender as defaultEmailSender } from "@/server/lib/email";
import type { EmailSender } from "@/server/lib/email";
import { writeAuditLog } from "@/server/modules/admin/audit";
import type { AdminMutationResult } from "@/server/modules/admin/types";
import { returnSoldStock } from "@/server/modules/inventory/service";
import {
  sendOrderCancelledEmail,
  sendOrderRefundedEmail,
  sendOrderShippedEmail,
} from "@/server/modules/notifications/service";
import { createRazorpayClient } from "@/server/modules/payments/razorpay";
import type { RazorpayClient } from "@/server/modules/payments/razorpay";
import { getOrderById, getOrderItems } from "./queries";
import { transition } from "./stateMachine";
import type { Order, OrderStatus } from "./stateMachine";

const PAID_STATES: OrderStatus[] = ["paid", "processing", "shipped", "delivered"];

function actorFor(adminUserId: string): string {
  return `admin:${adminUserId}`;
}

export async function markOrderProcessing(
  orderId: string,
  adminUserId: string,
  dbHandle: Db = db,
): Promise<AdminMutationResult<Order>> {
  return dbHandle.transaction(async (tx) => {
    const order = await getOrderById(orderId, tx);
    if (!order) throw new NotFoundError(`Order ${orderId}`);

    const updated = await transition(
      tx,
      orderId,
      order.status,
      "processing",
      actorFor(adminUserId),
    );
    if (!updated) {
      throw new Error(
        `markOrderProcessing: order ${orderId} can't move from ${order.status} to processing`,
      );
    }

    await writeAuditLog(tx, {
      adminUserId,
      action: "order.markProcessing",
      entityType: "order",
      entityId: orderId,
      before: { status: order.status },
      after: { status: updated.status },
    });

    return { result: updated, revalidateTags: [] };
  });
}

export interface MarkOrderShippedInput {
  orderId: string;
  courier: string;
  trackingNumber: string;
  trackingUrl?: string;
}

export async function markOrderShipped(
  input: MarkOrderShippedInput,
  adminUserId: string,
  dbHandle: Db = db,
  emailSender: EmailSender = defaultEmailSender,
): Promise<AdminMutationResult<Order>> {
  const result = await dbHandle.transaction(async (tx) => {
    const order = await getOrderById(input.orderId, tx);
    if (!order) throw new NotFoundError(`Order ${input.orderId}`);

    const updated = await transition(
      tx,
      input.orderId,
      order.status,
      "shipped",
      actorFor(adminUserId),
      {
        courier: input.courier,
        trackingNumber: input.trackingNumber,
        trackingUrl: input.trackingUrl,
      },
    );
    if (!updated) {
      throw new Error(
        `markOrderShipped: order ${input.orderId} can't move from ${order.status} to shipped`,
      );
    }

    await writeAuditLog(tx, {
      adminUserId,
      action: "order.markShipped",
      entityType: "order",
      entityId: input.orderId,
      before: { status: order.status },
      after: {
        status: updated.status,
        courier: input.courier,
        trackingNumber: input.trackingNumber,
      },
    });

    return { result: updated, revalidateTags: [] };
  });

  await sendOrderShippedEmail(input.orderId, dbHandle, emailSender);

  return result;
}

export async function markOrderDelivered(
  orderId: string,
  adminUserId: string,
  dbHandle: Db = db,
): Promise<AdminMutationResult<Order>> {
  return dbHandle.transaction(async (tx) => {
    const order = await getOrderById(orderId, tx);
    if (!order) throw new NotFoundError(`Order ${orderId}`);

    const updated = await transition(tx, orderId, order.status, "delivered", actorFor(adminUserId));
    if (!updated) {
      throw new Error(
        `markOrderDelivered: order ${orderId} can't move from ${order.status} to delivered`,
      );
    }

    await writeAuditLog(tx, {
      adminUserId,
      action: "order.markDelivered",
      entityType: "order",
      entityId: orderId,
      before: { status: order.status },
      after: { status: updated.status },
    });

    return { result: updated, revalidateTags: [] };
  });
}

export async function setOrderNote(
  orderId: string,
  note: string,
  adminUserId: string,
  dbHandle: Db = db,
): Promise<AdminMutationResult<Order>> {
  return dbHandle.transaction(async (tx) => {
    const before = await getOrderById(orderId, tx);
    if (!before) throw new NotFoundError(`Order ${orderId}`);

    const [after] = await tx
      .update(orders)
      .set({ adminNote: note, updatedAt: new Date() })
      .where(eq(orders.id, orderId))
      .returning();

    await writeAuditLog(tx, {
      adminUserId,
      action: "order.setNote",
      entityType: "order",
      entityId: orderId,
      before: { adminNote: before.adminNote },
      after: { adminNote: after!.adminNote },
    });

    return { result: after!, revalidateTags: [] };
  });
}

async function findCapturedPayment(order: Order, dbHandle: Db) {
  const payment = await dbHandle.query.payments.findFirst({
    where: and(eq(payments.orderId, order.id), eq(payments.status, "captured")),
  });
  if (!payment?.razorpayPaymentId) {
    throw new Error(`No captured payment found for order ${order.id} — can't refund`);
  }
  return payment;
}

export interface RefundOrderInput {
  orderId: string;
  /** Omit for a full refund of whatever's left unrefunded. */
  amountPaise?: number;
  reason: string;
}

/**
 * A refund that doesn't necessarily change the order's status (docs/06
 * §10: "any paid state -> refunded | full refund complete; partial refunds
 * tracked in refundedPaise while status is unchanged") — only transitions
 * to `refunded` once the running total actually reaches the order total.
 * For the "customer wants this whole order cancelled" case, see
 * `cancelPaidOrder` instead, which forces a full refund and restocks.
 */
export async function refundOrder(
  input: RefundOrderInput,
  adminUserId: string,
  dbHandle: Db = db,
  razorpay: RazorpayClient = createRazorpayClient(),
  emailSender: EmailSender = defaultEmailSender,
): Promise<AdminMutationResult<{ order: Order; refundId: string }>> {
  const order = await getOrderById(input.orderId, dbHandle);
  if (!order) throw new NotFoundError(`Order ${input.orderId}`);
  if (!PAID_STATES.includes(order.status)) {
    throw new Error(
      `refundOrder: order ${input.orderId} is not in a paid state (currently ${order.status})`,
    );
  }

  const remaining = order.totalPaise - order.refundedPaise;
  const amountPaise = input.amountPaise ?? remaining;
  if (amountPaise <= 0 || amountPaise > remaining) {
    throw new Error(
      `refundOrder: amountPaise must be between 1 and ${remaining} (remaining refundable), got ${amountPaise}`,
    );
  }

  const payment = await findCapturedPayment(order, dbHandle);
  const razorpayRefund = await razorpay.createRefund(payment.razorpayPaymentId!, {
    amountPaise,
    notes: { reason: input.reason },
  });

  let isFullRefund = false;
  const result = await dbHandle.transaction(async (tx) => {
    const [refundRow] = await tx
      .insert(refunds)
      .values({
        orderId: input.orderId,
        paymentId: payment.id,
        razorpayRefundId: razorpayRefund.id,
        amountPaise,
        reason: input.reason,
        status: razorpayRefund.status,
        createdBy: adminUserId,
      })
      .returning();

    const newRefundedPaise = order.refundedPaise + amountPaise;
    isFullRefund = newRefundedPaise >= order.totalPaise;

    if (isFullRefund) {
      await transition(tx, input.orderId, order.status, "refunded", actorFor(adminUserId), {
        note: `refund ${razorpayRefund.id}`,
      });
    }

    const [afterUpdate] = await tx
      .update(orders)
      .set({ refundedPaise: newRefundedPaise, updatedAt: new Date() })
      .where(eq(orders.id, input.orderId))
      .returning();

    await writeAuditLog(tx, {
      adminUserId,
      action: "order.refund",
      entityType: "order",
      entityId: input.orderId,
      after: { amountPaise, razorpayRefundId: razorpayRefund.id, fullRefund: isFullRefund },
    });

    return { result: { order: afterUpdate!, refundId: refundRow!.id }, revalidateTags: [] };
  });

  await sendOrderRefundedEmail(input.orderId, amountPaise, isFullRefund, dbHandle, emailSender);

  return result;
}

export interface CancelPaidOrderInput {
  orderId: string;
  reason: string;
}

/**
 * docs/06 §10: "paid/processing -> cancelled | admin | refund required
 * (Razorpay), restock, email." Always a full refund of whatever's left
 * unrefunded, plus restocking every line — this is "the customer isn't
 * getting this order after all," not a partial-refund adjustment.
 */
export async function cancelPaidOrder(
  input: CancelPaidOrderInput,
  adminUserId: string,
  dbHandle: Db = db,
  razorpay: RazorpayClient = createRazorpayClient(),
  emailSender: EmailSender = defaultEmailSender,
): Promise<AdminMutationResult<Order>> {
  const order = await getOrderById(input.orderId, dbHandle);
  if (!order) throw new NotFoundError(`Order ${input.orderId}`);
  if (order.status !== "paid" && order.status !== "processing") {
    throw new Error(
      `cancelPaidOrder: order ${input.orderId} must be paid or processing (currently ${order.status})`,
    );
  }

  const remaining = order.totalPaise - order.refundedPaise;
  const payment = remaining > 0 ? await findCapturedPayment(order, dbHandle) : null;
  const razorpayRefund =
    payment && remaining > 0
      ? await razorpay.createRefund(payment.razorpayPaymentId!, {
          amountPaise: remaining,
          notes: { reason: input.reason },
        })
      : null;

  const result = await dbHandle.transaction(async (tx) => {
    if (razorpayRefund && payment) {
      await tx.insert(refunds).values({
        orderId: input.orderId,
        paymentId: payment.id,
        razorpayRefundId: razorpayRefund.id,
        amountPaise: remaining,
        reason: input.reason,
        status: razorpayRefund.status,
        createdBy: adminUserId,
      });
    }

    const items = await getOrderItems(input.orderId, tx);
    const lines = items
      .filter((i) => i.variantId)
      .map((i) => ({ variantId: i.variantId!, quantity: i.quantity }));
    if (lines.length > 0) {
      await returnSoldStock(tx, lines, {
        orderId: input.orderId,
        note: `admin cancel: ${input.reason}`,
      });
    }

    const updated = await transition(
      tx,
      input.orderId,
      order.status,
      "cancelled",
      actorFor(adminUserId),
      {
        cancelReason: input.reason,
      },
    );
    if (!updated) {
      throw new Error(
        `cancelPaidOrder: order ${input.orderId} changed state concurrently — aborting without a second refund`,
      );
    }

    const [afterUpdate] = await tx
      .update(orders)
      .set({ refundedPaise: order.refundedPaise + remaining })
      .where(eq(orders.id, input.orderId))
      .returning();

    await writeAuditLog(tx, {
      adminUserId,
      action: "order.cancelPaid",
      entityType: "order",
      entityId: input.orderId,
      before: { status: order.status },
      after: { status: "cancelled", refundedAmountPaise: remaining, reason: input.reason },
    });

    return { result: afterUpdate!, revalidateTags: [] };
  });

  await sendOrderCancelledEmail(input.orderId, input.reason, remaining, dbHandle, emailSender);

  return result;
}
