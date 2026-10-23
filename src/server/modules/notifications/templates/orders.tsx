import { formatINR } from "@/server/lib/money";
import {
  ACCENT,
  Button,
  CARD_BORDER,
  ContactGrid,
  Divider,
  Heading,
  MUTED_COLOR,
  Muted,
  OrderStepper,
  SectionHeading,
  SocialAndAddress,
  TEXT_COLOR,
  TOTAL_BG,
  renderEmail,
} from "./shared";
import type { RenderedEmail, StoreContactInfo } from "./shared";

export type { RenderedEmail, StoreContactInfo };

export interface OrderEmailLine {
  productName: string;
  size: string;
  color: string;
  quantity: number;
  lineTotalPaise: number;
  /** null when the line has no product image, or none was ever uploaded. */
  imageUrl?: string | null;
}

export interface OrderEmailAddress {
  fullName: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
}

function addressText(a: OrderEmailAddress): string {
  return [a.fullName, a.line1, a.line2, `${a.city}, ${a.state} ${a.pincode}`]
    .filter(Boolean)
    .join(", ");
}

function OrderNumber({ orderNumber }: { orderNumber: number }) {
  return (
    <p style={{ margin: "0 0 20px", textAlign: "center", fontSize: 14, color: MUTED_COLOR }}>
      Order number: <span style={{ color: ACCENT, fontWeight: 600 }}>IK-{orderNumber}</span>
    </p>
  );
}

function LineItems({ lines }: { lines: OrderEmailLine[] }) {
  return (
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
      <tbody>
        {lines.map((line, i) => (
          <tr key={i}>
            <td
              style={{
                padding: "12px 0",
                borderBottom: `1px solid ${CARD_BORDER}`,
                width: 48,
              }}
            >
              {line.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- an email document rendered by @react-email/render, not a Next.js page; next/image's optimizer/hydration doesn't apply, and email clients need a plain <img>.
                <img
                  src={line.imageUrl}
                  width={48}
                  height={48}
                  alt=""
                  style={{
                    display: "block",
                    width: 48,
                    height: 48,
                    borderRadius: 8,
                    objectFit: "cover",
                    border: `1px solid ${CARD_BORDER}`,
                  }}
                />
              ) : (
                <table role="presentation" cellPadding={0} cellSpacing={0}>
                  <tbody>
                    <tr>
                      <td
                        {...{ bgcolor: "#f5ebe4" }}
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 8,
                          backgroundColor: "#f5ebe4",
                        }}
                      />
                    </tr>
                  </tbody>
                </table>
              )}
            </td>
            <td
              style={{
                padding: "12px 0 12px 14px",
                borderBottom: `1px solid ${CARD_BORDER}`,
                fontSize: 14,
                verticalAlign: "top",
              }}
            >
              <span style={{ fontWeight: 600 }}>{line.productName}</span>
              <br />
              <span style={{ color: MUTED_COLOR, fontSize: 13 }}>
                {line.size}, {line.color} · Qty {line.quantity}
              </span>
            </td>
            <td
              style={{
                padding: "12px 0",
                borderBottom: `1px solid ${CARD_BORDER}`,
                textAlign: "right",
                verticalAlign: "top",
                fontSize: 14,
                whiteSpace: "nowrap",
              }}
            >
              {formatINR(line.lineTotalPaise)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AddressAndSummary({
  shipTo,
  subtotalPaise,
  shippingPaise,
  totalPaise,
  paymentMethod,
}: {
  shipTo: OrderEmailAddress;
  subtotalPaise: number;
  shippingPaise: number;
  totalPaise: number;
  paymentMethod?: string | null;
}) {
  return (
    <table
      role="presentation"
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      style={{ margin: "20px 0 0" }}
    >
      <tbody>
        <tr>
          <td
            className="ik-stack-td"
            width="52%"
            style={{ verticalAlign: "top", paddingRight: 12 }}
          >
            <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 600, color: MUTED_COLOR }}>
              SHIPPING ADDRESS
            </p>
            <p style={{ margin: 0, fontSize: 13, color: TEXT_COLOR, lineHeight: 1.5 }}>
              {addressText(shipTo)}
            </p>
          </td>
          <td className="ik-stack-td ik-stack-gap" width="48%" style={{ verticalAlign: "top" }}>
            <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
              <tbody>
                <tr>
                  <td style={{ fontSize: 13, color: MUTED_COLOR, padding: "2px 0" }}>Subtotal</td>
                  <td style={{ fontSize: 13, textAlign: "right", padding: "2px 0" }}>
                    {formatINR(subtotalPaise)}
                  </td>
                </tr>
                <tr>
                  <td style={{ fontSize: 13, color: MUTED_COLOR, padding: "2px 0" }}>Shipping</td>
                  <td style={{ fontSize: 13, textAlign: "right", padding: "2px 0" }}>
                    {shippingPaise > 0 ? formatINR(shippingPaise) : "Free"}
                  </td>
                </tr>
                <tr>
                  <td
                    {...{ bgcolor: TOTAL_BG }}
                    style={{
                      backgroundColor: TOTAL_BG,
                      fontWeight: 600,
                      fontSize: 14,
                      padding: "8px 10px",
                      borderRadius: "8px 0 0 8px",
                    }}
                  >
                    Total
                  </td>
                  <td
                    {...{ bgcolor: TOTAL_BG }}
                    style={{
                      backgroundColor: TOTAL_BG,
                      fontWeight: 600,
                      fontSize: 14,
                      textAlign: "right",
                      padding: "8px 10px",
                      borderRadius: "0 8px 8px 0",
                    }}
                  >
                    {formatINR(totalPaise)}
                  </td>
                </tr>
              </tbody>
            </table>
            {paymentMethod ? (
              <p
                style={{ margin: "6px 0 0", fontSize: 12, color: MUTED_COLOR, textAlign: "right" }}
              >
                Paid via {paymentMethod} · incl. GST
              </p>
            ) : (
              <p
                style={{ margin: "6px 0 0", fontSize: 12, color: MUTED_COLOR, textAlign: "right" }}
              >
                incl. GST
              </p>
            )}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export interface OrderConfirmationData {
  orderNumber: number;
  customerName: string;
  subtotalPaise: number;
  shippingPaise: number;
  totalPaise: number;
  paymentMethod?: string | null;
  lines: OrderEmailLine[];
  shipTo: OrderEmailAddress;
  orderUrl: string;
  store: StoreContactInfo;
}

export async function orderConfirmationTemplate(
  order: OrderConfirmationData,
): Promise<RenderedEmail> {
  return renderEmail(
    `Order confirmed - IK-${order.orderNumber}`,
    <>
      <SectionHeading>Order details</SectionHeading>
      <OrderNumber orderNumber={order.orderNumber} />
      <LineItems lines={order.lines} />
      <AddressAndSummary
        shipTo={order.shipTo}
        subtotalPaise={order.subtotalPaise}
        shippingPaise={order.shippingPaise}
        totalPaise={order.totalPaise}
        paymentMethod={order.paymentMethod}
      />
      <Divider />
      <ContactGrid store={order.store} />
      <SocialAndAddress store={order.store} />
    </>,
    <>
      <p style={{ margin: "0 0 6px", fontSize: 21, fontWeight: 600, color: TEXT_COLOR }}>
        Yay, {order.customerName} - your order&apos;s confirmed! 🎉
      </p>
      <p style={{ margin: 0, fontSize: 14, color: MUTED_COLOR }}>
        We&apos;re getting it ready. You&apos;ll get another email once it ships.
      </p>
      <OrderStepper current="confirmed" />
      <Button href={order.orderUrl}>View your order</Button>
    </>,
  );
}

export interface OrderShippedData extends OrderConfirmationData {
  courier: string;
  trackingNumber: string;
  trackingUrl: string | null;
}

export async function orderShippedTemplate(order: OrderShippedData): Promise<RenderedEmail> {
  return renderEmail(
    `Your order IK-${order.orderNumber} has shipped`,
    <>
      <SectionHeading>Order details</SectionHeading>
      <OrderNumber orderNumber={order.orderNumber} />
      <LineItems lines={order.lines} />
      <Divider />
      <ContactGrid store={order.store} />
      <SocialAndAddress store={order.store} />
    </>,
    <>
      <p style={{ margin: "0 0 6px", fontSize: 21, fontWeight: 600, color: TEXT_COLOR }}>
        On its way, {order.customerName}! 📦
      </p>
      <p style={{ margin: 0, fontSize: 14, color: MUTED_COLOR }}>
        {order.courier} · {order.trackingNumber}
      </p>
      <OrderStepper current="shipped" />
      {order.trackingUrl ? <Button href={order.trackingUrl}>Track your package</Button> : null}
    </>,
  );
}

/** Sent when the admin marks an order delivered. Same data as the confirmation email. */
export async function orderDeliveredTemplate(order: OrderConfirmationData): Promise<RenderedEmail> {
  return renderEmail(
    `Your order IK-${order.orderNumber} has been delivered`,
    <>
      <SectionHeading>Order details</SectionHeading>
      <OrderNumber orderNumber={order.orderNumber} />
      <LineItems lines={order.lines} />
      <Divider />
      <ContactGrid store={order.store} />
      <SocialAndAddress store={order.store} />
    </>,
    <>
      <p style={{ margin: "0 0 6px", fontSize: 21, fontWeight: 600, color: TEXT_COLOR }}>
        Delivered, {order.customerName}! 🎉
      </p>
      <p style={{ margin: 0, fontSize: 14, color: MUTED_COLOR }}>
        We hope you love it. If anything isn&apos;t right, just reply to this email.
      </p>
      <OrderStepper current="delivered" />
      <Button href={order.orderUrl}>View your order</Button>
    </>,
  );
}

export interface OrderCancelledData {
  orderNumber: number;
  customerName: string;
  reason: string;
  refundedPaise: number;
}

export async function orderCancelledTemplate(order: OrderCancelledData): Promise<RenderedEmail> {
  return renderEmail(
    `Order IK-${order.orderNumber} cancelled`,
    <>
      <Heading>Hi {order.customerName},</Heading>
      <p style={{ margin: "0 0 8px" }}>
        Your order <strong>IK-{order.orderNumber}</strong> has been cancelled.
      </p>
      {order.refundedPaise > 0 ? (
        <p style={{ margin: "0 0 8px" }}>
          {formatINR(order.refundedPaise)} has been refunded to your original payment method.
        </p>
      ) : null}
      <Muted>If you have any questions, just reply to this email.</Muted>
    </>,
  );
}

export interface OrderRefundedData {
  orderNumber: number;
  customerName: string;
  amountPaise: number;
  fullRefund: boolean;
}

export async function orderRefundedTemplate(order: OrderRefundedData): Promise<RenderedEmail> {
  const subject = order.fullRefund
    ? `Order IK-${order.orderNumber} refunded`
    : `Partial refund for order IK-${order.orderNumber}`;

  return renderEmail(
    subject,
    <>
      <Heading>Hi {order.customerName},</Heading>
      <p style={{ margin: "0 0 8px" }}>
        <strong>{formatINR(order.amountPaise)}</strong> has been refunded to your original payment
        method for order <strong>IK-{order.orderNumber}</strong>
        {order.fullRefund ? "" : " (partial refund)"}.
      </p>
      <Muted>Refunds typically take 5-7 business days to appear, depending on your bank.</Muted>
    </>,
  );
}
