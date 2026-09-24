import "server-only";
import { db } from "@/server/db/client";
import type { DbOrTx } from "@/server/db/client";
import { emailSender as defaultEmailSender } from "@/server/lib/email";
import type { EmailSender } from "@/server/lib/email";
import { logger } from "@/server/lib/logger";
import { getOrderById, getOrderItems } from "@/server/modules/orders/queries";
import {
  orderCancelledTemplate,
  orderConfirmationTemplate,
  orderRefundedTemplate,
  orderShippedTemplate,
} from "./templates/orders";
import type { OrderEmailAddress, OrderEmailLine, RenderedEmail } from "./templates/orders";

/**
 * Order-lifecycle transactional emails (docs/10 §22 Phase 8) — each
 * function loads what it needs and sends, never throwing: a failed send
 * is logged, not propagated, since email is a notification concern, not
 * something that should undo or block an already-committed order mutation.
 * `emailSender` is injectable (default: the real singleton) so callers'
 * tests can assert what *would* have been sent without hitting Resend.
 */

function toEmailLines(
  items: {
    productName: string;
    size: string;
    color: string;
    quantity: number;
    lineTotalPaise: number;
  }[],
): OrderEmailLine[] {
  return items.map((i) => ({
    productName: i.productName,
    size: i.size,
    color: i.color,
    quantity: i.quantity,
    lineTotalPaise: i.lineTotalPaise,
  }));
}

function shipToFrom(order: {
  shipFullName: string;
  shipLine1: string;
  shipLine2: string | null;
  shipCity: string;
  shipState: string;
  shipPincode: string;
}): OrderEmailAddress {
  return {
    fullName: order.shipFullName,
    line1: order.shipLine1,
    line2: order.shipLine2,
    city: order.shipCity,
    state: order.shipState,
    pincode: order.shipPincode,
  };
}

async function sendSafely(
  sender: EmailSender,
  to: string,
  email: RenderedEmail,
  context: Record<string, unknown>,
): Promise<void> {
  try {
    await sender.send({ to, subject: email.subject, html: email.html, text: email.text });
  } catch (error) {
    logger.error("notifications: failed to send email", { ...context, error });
  }
}

export async function sendOrderConfirmationEmail(
  orderId: string,
  dbHandle: DbOrTx = db,
  sender: EmailSender = defaultEmailSender,
): Promise<void> {
  const order = await getOrderById(orderId, dbHandle);
  if (!order) {
    logger.error("sendOrderConfirmationEmail: order not found", { orderId });
    return;
  }
  const items = await getOrderItems(orderId, dbHandle);

  const email = orderConfirmationTemplate({
    orderNumber: order.orderNumber,
    customerName: order.shipFullName,
    totalPaise: order.totalPaise,
    lines: toEmailLines(items),
    shipTo: shipToFrom(order),
  });
  await sendSafely(sender, order.customerEmail, email, { orderId, kind: "confirmation" });
}

export async function sendOrderShippedEmail(
  orderId: string,
  dbHandle: DbOrTx = db,
  sender: EmailSender = defaultEmailSender,
): Promise<void> {
  const order = await getOrderById(orderId, dbHandle);
  if (!order) {
    logger.error("sendOrderShippedEmail: order not found", { orderId });
    return;
  }
  if (!order.courier || !order.trackingNumber) {
    logger.error("sendOrderShippedEmail: order has no courier/trackingNumber", { orderId });
    return;
  }
  const items = await getOrderItems(orderId, dbHandle);

  const email = orderShippedTemplate({
    orderNumber: order.orderNumber,
    customerName: order.shipFullName,
    totalPaise: order.totalPaise,
    lines: toEmailLines(items),
    shipTo: shipToFrom(order),
    courier: order.courier,
    trackingNumber: order.trackingNumber,
    trackingUrl: order.trackingUrl,
  });
  await sendSafely(sender, order.customerEmail, email, { orderId, kind: "shipped" });
}

export async function sendOrderCancelledEmail(
  orderId: string,
  reason: string,
  refundedPaise: number,
  dbHandle: DbOrTx = db,
  sender: EmailSender = defaultEmailSender,
): Promise<void> {
  const order = await getOrderById(orderId, dbHandle);
  if (!order) {
    logger.error("sendOrderCancelledEmail: order not found", { orderId });
    return;
  }
  const email = orderCancelledTemplate({
    orderNumber: order.orderNumber,
    customerName: order.shipFullName,
    reason,
    refundedPaise,
  });
  await sendSafely(sender, order.customerEmail, email, { orderId, kind: "cancelled" });
}

export async function sendOrderRefundedEmail(
  orderId: string,
  amountPaise: number,
  fullRefund: boolean,
  dbHandle: DbOrTx = db,
  sender: EmailSender = defaultEmailSender,
): Promise<void> {
  const order = await getOrderById(orderId, dbHandle);
  if (!order) {
    logger.error("sendOrderRefundedEmail: order not found", { orderId });
    return;
  }
  const email = orderRefundedTemplate({
    orderNumber: order.orderNumber,
    customerName: order.shipFullName,
    amountPaise,
    fullRefund,
  });
  await sendSafely(sender, order.customerEmail, email, { orderId, kind: "refunded" });
}
