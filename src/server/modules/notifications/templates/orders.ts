import { formatINR } from "@/server/lib/money";
import { escapeHtml, renderLayout } from "./shared";
import type { RenderedEmail } from "./shared";

export type { RenderedEmail };

export interface OrderEmailLine {
  productName: string;
  size: string;
  color: string;
  quantity: number;
  lineTotalPaise: number;
}

export interface OrderEmailAddress {
  fullName: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
}

function renderLinesHtml(lines: OrderEmailLine[]): string {
  const rows = lines
    .map(
      (l) =>
        `<tr>
          <td style="padding:8px 0; border-bottom:1px solid #eeeeee;">${escapeHtml(l.productName)} (${escapeHtml(l.size)}, ${escapeHtml(l.color)}) × ${l.quantity}</td>
          <td style="padding:8px 0; border-bottom:1px solid #eeeeee; text-align:right;">${formatINR(l.lineTotalPaise)}</td>
        </tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" style="border-collapse:collapse; margin:16px 0;">${rows}</table>`;
}

function renderLinesText(lines: OrderEmailLine[]): string {
  return lines
    .map(
      (l) =>
        `- ${l.productName} (${l.size}, ${l.color}) x${l.quantity} — ${formatINR(l.lineTotalPaise)}`,
    )
    .join("\n");
}

function renderAddressText(a: OrderEmailAddress): string {
  return [a.fullName, a.line1, a.line2, `${a.city}, ${a.state} ${a.pincode}`]
    .filter(Boolean)
    .join(", ");
}

export interface OrderConfirmationData {
  orderNumber: number;
  customerName: string;
  totalPaise: number;
  lines: OrderEmailLine[];
  shipTo: OrderEmailAddress;
}

export function orderConfirmationTemplate(order: OrderConfirmationData): RenderedEmail {
  const subject = `Order confirmed — IK-${order.orderNumber}`;
  const addressText = renderAddressText(order.shipTo);
  const html = renderLayout(`
    <p>Hi ${escapeHtml(order.customerName)},</p>
    <p>Thanks for your order! We've received your payment for order <strong>IK-${order.orderNumber}</strong>.</p>
    ${renderLinesHtml(order.lines)}
    <p><strong>Total: ${formatINR(order.totalPaise)}</strong></p>
    <p>Shipping to: ${escapeHtml(addressText)}</p>
  `);
  const text = `Hi ${order.customerName},\n\nThanks for your order! We've received your payment for order IK-${order.orderNumber}.\n\n${renderLinesText(order.lines)}\n\nTotal: ${formatINR(order.totalPaise)}\n\nShipping to: ${addressText}`;
  return { subject, html, text };
}

export interface OrderShippedData extends OrderConfirmationData {
  courier: string;
  trackingNumber: string;
  trackingUrl: string | null;
}

export function orderShippedTemplate(order: OrderShippedData): RenderedEmail {
  const subject = `Your order IK-${order.orderNumber} has shipped`;
  const trackingHtml = order.trackingUrl
    ? `<p><a href="${order.trackingUrl}">Track your package</a> (${escapeHtml(order.courier)}, ${escapeHtml(order.trackingNumber)})</p>`
    : `<p>Courier: ${escapeHtml(order.courier)} — Tracking number: ${escapeHtml(order.trackingNumber)}</p>`;
  const html = renderLayout(`
    <p>Hi ${escapeHtml(order.customerName)},</p>
    <p>Good news — your order <strong>IK-${order.orderNumber}</strong> is on its way!</p>
    ${trackingHtml}
    ${renderLinesHtml(order.lines)}
  `);
  const text = `Hi ${order.customerName},\n\nYour order IK-${order.orderNumber} has shipped.\nCourier: ${order.courier}\nTracking: ${order.trackingNumber}${order.trackingUrl ? ` (${order.trackingUrl})` : ""}\n\n${renderLinesText(order.lines)}`;
  return { subject, html, text };
}

export interface OrderCancelledData {
  orderNumber: number;
  customerName: string;
  reason: string;
  refundedPaise: number;
}

export function orderCancelledTemplate(order: OrderCancelledData): RenderedEmail {
  const subject = `Order IK-${order.orderNumber} cancelled`;
  const refundHtml =
    order.refundedPaise > 0
      ? `<p>${formatINR(order.refundedPaise)} has been refunded to your original payment method.</p>`
      : "";
  const html = renderLayout(`
    <p>Hi ${escapeHtml(order.customerName)},</p>
    <p>Your order <strong>IK-${order.orderNumber}</strong> has been cancelled.</p>
    ${refundHtml}
    <p>If you have any questions, just reply to this email.</p>
  `);
  const refundText =
    order.refundedPaise > 0
      ? ` ${formatINR(order.refundedPaise)} has been refunded to your original payment method.`
      : "";
  const text = `Hi ${order.customerName},\n\nYour order IK-${order.orderNumber} has been cancelled.${refundText}\n\nIf you have any questions, just reply to this email.`;
  return { subject, html, text };
}

export interface OrderRefundedData {
  orderNumber: number;
  customerName: string;
  amountPaise: number;
  fullRefund: boolean;
}

export function orderRefundedTemplate(order: OrderRefundedData): RenderedEmail {
  const subject = order.fullRefund
    ? `Order IK-${order.orderNumber} refunded`
    : `Partial refund for order IK-${order.orderNumber}`;
  const suffix = order.fullRefund ? "" : " (partial refund)";
  const html = renderLayout(`
    <p>Hi ${escapeHtml(order.customerName)},</p>
    <p>${formatINR(order.amountPaise)} has been refunded to your original payment method for order <strong>IK-${order.orderNumber}</strong>${suffix}.</p>
    <p>Refunds typically take 5-7 business days to appear, depending on your bank.</p>
  `);
  const text = `Hi ${order.customerName},\n\n${formatINR(order.amountPaise)} has been refunded to your original payment method for order IK-${order.orderNumber}${suffix}.\n\nRefunds typically take 5-7 business days to appear, depending on your bank.`;
  return { subject, html, text };
}
