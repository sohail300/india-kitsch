import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import type { DbOrTx } from "@/server/db/client";
import { payments } from "@/server/db/schema";
import { emailSender as defaultEmailSender } from "@/server/lib/email";
import type { EmailSender } from "@/server/lib/email";
import { env } from "@/server/lib/env";
import { logger } from "@/server/lib/logger";
import { getOrderById, getOrderItems } from "@/server/modules/orders/queries";
import { getStoreInfo } from "@/server/modules/settings/queries";
import {
  orderCancelledTemplate,
  orderConfirmationTemplate,
  orderRefundedTemplate,
  orderDeliveredTemplate,
  orderShippedTemplate,
} from "./templates/orders";
import type {
  OrderEmailAddress,
  OrderEmailLine,
  RenderedEmail,
  StoreContactInfo,
} from "./templates/orders";

/**
 * Order-lifecycle transactional emails (docs/10 §22 Phase 8) - each
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
    imageKey: string | null;
  }[],
): OrderEmailLine[] {
  return items.map((i) => ({
    productName: i.productName,
    size: i.size,
    color: i.color,
    quantity: i.quantity,
    lineTotalPaise: i.lineTotalPaise,
    imageUrl: i.imageKey ? `${env.NEXT_PUBLIC_IMAGE_BASE_URL}/${i.imageKey}` : null,
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

/** Forward-compatible with the customer order-detail page docs/02 plans for
 * Phase 10 (`account/orders/[number]`) - not live yet, but the link is
 * already correct for when it is, rather than needing every past email's
 * button to be right the moment that page ships. */
function orderUrlFor(orderNumber: number): string {
  return `${env.NEXT_PUBLIC_SITE_URL}/account/orders/${orderNumber}`;
}

async function getCapturedPaymentMethod(orderId: string, dbHandle: DbOrTx): Promise<string | null> {
  const payment = await dbHandle.query.payments.findFirst({
    where: and(eq(payments.orderId, orderId), eq(payments.status, "captured")),
  });
  return payment?.method ?? null;
}

/** Never fabricated: address lines and social links only appear once the
 * owner actually fills them in via /admin/settings - see store-info-form.tsx. */
async function getStoreContactInfo(dbHandle: DbOrTx): Promise<StoreContactInfo> {
  const info = await getStoreInfo(dbHandle);
  const addressLines = [
    info.addressLine1,
    info.addressLine2,
    [info.addressCity, info.addressPincode].filter(Boolean).join(" "),
  ].filter((line): line is string => Boolean(line && line.trim().length > 0));

  const social = (
    [
      info.instagramUrl ? { label: "Instagram", url: info.instagramUrl } : null,
      info.facebookUrl ? { label: "Facebook", url: info.facebookUrl } : null,
    ] as const
  ).filter((s): s is { label: string; url: string } => s !== null);

  return {
    email: info.contactEmail,
    phone: info.contactPhone ?? null,
    addressLines,
    social,
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
  const paymentMethod = await getCapturedPaymentMethod(orderId, dbHandle);
  const store = await getStoreContactInfo(dbHandle);

  const email = await orderConfirmationTemplate({
    orderNumber: order.orderNumber,
    customerName: order.shipFullName,
    subtotalPaise: order.subtotalPaise,
    shippingPaise: order.shippingPaise,
    totalPaise: order.totalPaise,
    paymentMethod,
    lines: toEmailLines(items),
    shipTo: shipToFrom(order),
    orderUrl: orderUrlFor(order.orderNumber),
    store,
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
  const paymentMethod = await getCapturedPaymentMethod(orderId, dbHandle);
  const store = await getStoreContactInfo(dbHandle);

  const email = await orderShippedTemplate({
    orderNumber: order.orderNumber,
    customerName: order.shipFullName,
    subtotalPaise: order.subtotalPaise,
    shippingPaise: order.shippingPaise,
    totalPaise: order.totalPaise,
    paymentMethod,
    lines: toEmailLines(items),
    shipTo: shipToFrom(order),
    orderUrl: orderUrlFor(order.orderNumber),
    store,
    courier: order.courier,
    trackingNumber: order.trackingNumber,
    trackingUrl: order.trackingUrl,
  });
  await sendSafely(sender, order.customerEmail, email, { orderId, kind: "shipped" });
}

/** "Delivered" email, sent when the admin marks an order delivered. Never throws (sendSafely). */
export async function sendOrderDeliveredEmail(
  orderId: string,
  dbHandle: DbOrTx = db,
  sender: EmailSender = defaultEmailSender,
): Promise<void> {
  const order = await getOrderById(orderId, dbHandle);
  if (!order) {
    logger.error("sendOrderDeliveredEmail: order not found", { orderId });
    return;
  }
  const items = await getOrderItems(orderId, dbHandle);
  const paymentMethod = await getCapturedPaymentMethod(orderId, dbHandle);
  const store = await getStoreContactInfo(dbHandle);

  const email = await orderDeliveredTemplate({
    orderNumber: order.orderNumber,
    customerName: order.shipFullName,
    subtotalPaise: order.subtotalPaise,
    shippingPaise: order.shippingPaise,
    totalPaise: order.totalPaise,
    paymentMethod,
    lines: toEmailLines(items),
    shipTo: shipToFrom(order),
    orderUrl: orderUrlFor(order.orderNumber),
    store,
  });
  await sendSafely(sender, order.customerEmail, email, { orderId, kind: "delivered" });
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
  const email = await orderCancelledTemplate({
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
  const email = await orderRefundedTemplate({
    orderNumber: order.orderNumber,
    customerName: order.shipFullName,
    amountPaise,
    fullRefund,
  });
  await sendSafely(sender, order.customerEmail, email, { orderId, kind: "refunded" });
}
