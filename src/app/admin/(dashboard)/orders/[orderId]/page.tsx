import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, inArray } from "drizzle-orm";
import { ArrowLeftIcon, ImageIcon, PrinterIcon } from "lucide-react";
import { db } from "@/server/db/client";
import { orderEvents, user } from "@/server/db/schema";
import { formatINR } from "@/server/lib/money";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/app/admin/_components/page-header";
import {
  displayOrderStatus,
  ORDER_STATUS_LABEL,
  OrderStatusBadge,
} from "@/app/admin/_components/status-badge";
import { formatAdminDateTime } from "@/app/admin/_lib/format-date";
import {
  CancelOrderButton,
  MarkDeliveredButton,
  MarkProcessingButton,
  MarkShippedDialog,
} from "./order-status-actions";
import { RefundDialog } from "./refund-dialog";
import { OrderNoteForm } from "./order-note-form";

export const metadata: Metadata = { title: "Order - India Kitsch Admin" };

const imageBaseUrl = process.env.NEXT_PUBLIC_IMAGE_BASE_URL;
const statusLabel = (status: string) => ORDER_STATUS_LABEL[status] ?? status;

export default async function OrderDetailPage(props: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await props.params;

  const order = await db.query.orders.findFirst({
    where: (o, { eq }) => eq(o.id, orderId),
    with: {
      // The variant (if it still exists) links each line back to its product.
      items: { with: { variant: { columns: { productId: true } } } },
      user: { columns: { name: true, email: true, id: true } },
    },
  });
  if (!order) notFound();

  const events = await db.query.orderEvents.findMany({
    where: (e, { eq }) => eq(e.orderId, orderId),
    orderBy: [asc(orderEvents.createdAt)],
  });

  // Timeline "by": admin events store `admin:<userId>` — show their email.
  const adminIds = [
    ...new Set(
      events.filter((e) => e.actor.startsWith("admin:")).map((e) => e.actor.slice("admin:".length)),
    ),
  ];
  const adminEmails =
    adminIds.length > 0
      ? new Map(
          (
            await db
              .select({ id: user.id, email: user.email })
              .from(user)
              .where(inArray(user.id, adminIds))
          ).map((u) => [u.id, u.email]),
        )
      : new Map<string, string>();
  const actorLabel = (actor: string) =>
    actor.startsWith("admin:")
      ? (adminEmails.get(actor.slice("admin:".length)) ?? "An admin")
      : ({ system: "Automatic", razorpay: "Razorpay (payment)", customer: "Customer" }[actor] ??
        actor);

  const remainingPaise = order.totalPaise - order.refundedPaise;
  const canRefund =
    ["paid", "processing", "shipped", "delivered"].includes(order.status) && remainingPaise > 0;
  const canCancel = order.status === "paid" || order.status === "processing";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button variant="ghost" size="sm" render={<Link href="/admin/orders" />} className="mb-2">
          <ArrowLeftIcon /> Orders
        </Button>
        <PageHeader
          title={`Order IK-${order.orderNumber}`}
          description={`${formatAdminDateTime(order.createdAt)} · ${statusLabel(displayOrderStatus(order.status, order.cancelReason))} · ${formatINR(order.totalPaise)}`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <OrderStatusBadge status={displayOrderStatus(order.status, order.cancelReason)} />
              <Button
                variant="outline"
                size="sm"
                render={<Link href={`/admin/orders/${order.id}/invoice`} target="_blank" />}
              >
                <PrinterIcon /> Invoice
              </Button>
            </div>
          }
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {order.status === "paid" ? (
          <MarkProcessingButton orderId={order.id} orderNumber={order.orderNumber} />
        ) : null}
        {order.status === "processing" ? (
          <MarkShippedDialog orderId={order.id} orderNumber={order.orderNumber} />
        ) : null}
        {order.status === "shipped" ? (
          <MarkDeliveredButton orderId={order.id} orderNumber={order.orderNumber} />
        ) : null}
        {canRefund ? <RefundDialog orderId={order.id} remainingPaise={remainingPaise} /> : null}
        {canCancel ? <CancelOrderButton orderId={order.id} refundPaise={remainingPaise} /> : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card className="rounded-2xl border-none shadow-sm ring-1 ring-border">
            <CardHeader>
              <CardTitle>Items</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col divide-y divide-border p-0">
              {order.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-4 px-6 py-3 text-sm"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                      {item.imageKey && imageBaseUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`${imageBaseUrl}/${item.imageKey}`}
                          alt=""
                          className="size-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="size-4 text-muted-foreground" aria-label="No photo" />
                      )}
                    </div>
                    <div className="min-w-0">
                      {/* Snapshot name; links to the product while it still exists. */}
                      {item.variant?.productId ? (
                        <Link
                          href={`/admin/products/${item.variant.productId}`}
                          className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
                        >
                          {item.productName}
                        </Link>
                      ) : (
                        <p className="font-medium text-foreground">{item.productName}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {item.size} / {item.color} · {item.sku} · Qty {item.quantity}
                      </p>
                    </div>
                  </div>
                  <p className="font-medium text-foreground">{formatINR(item.lineTotalPaise)}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-none shadow-sm ring-1 ring-border">
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {events.map((event) => (
                <div key={event.id} className="flex items-start gap-3 text-sm">
                  <div className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                  <div>
                    <p className="text-foreground">
                      {event.fromStatus
                        ? `${statusLabel(event.fromStatus)} → ${statusLabel(event.toStatus)}`
                        : `Order created (${statusLabel(event.toStatus)})`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatAdminDateTime(event.createdAt)} · by {actorLabel(event.actor)}
                      {event.note ? ` · ${event.note}` : ""}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-none shadow-sm ring-1 ring-border">
            <CardHeader>
              <CardTitle>Internal note</CardTitle>
            </CardHeader>
            <CardContent>
              <OrderNoteForm orderId={order.id} initialNote={order.adminNote ?? ""} />
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card className="rounded-2xl border-none shadow-sm ring-1 ring-border">
            <CardHeader>
              <CardTitle>Payment summary</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <Row label="Subtotal" value={formatINR(order.subtotalPaise)} />
              {order.discountPaise > 0 ? (
                <Row
                  label={
                    order.couponCode ? (
                      <>
                        Discount (
                        <Link
                          href={`/admin/coupons?q=${encodeURIComponent(order.couponCode)}`}
                          className="font-mono text-foreground underline-offset-4 hover:text-primary hover:underline"
                        >
                          {order.couponCode}
                        </Link>
                        )
                      </>
                    ) : (
                      "Discount"
                    )
                  }
                  value={`-${formatINR(order.discountPaise)}`}
                />
              ) : null}
              <Row label="Shipping" value={formatINR(order.shippingPaise)} />
              <Row label="Tax (included)" value={formatINR(order.taxIncludedPaise)} />
              <Row label="Total" value={formatINR(order.totalPaise)} strong />
              {order.refundedPaise > 0 ? (
                <Row label="Refunded" value={formatINR(order.refundedPaise)} />
              ) : null}
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-none shadow-sm ring-1 ring-border">
            <CardHeader>
              <CardTitle>Customer</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 text-sm">
              <Link
                href={`/admin/customers/${order.userId}`}
                className="font-medium text-primary hover:underline"
              >
                {order.user.name}
              </Link>
              <p className="text-muted-foreground">{order.customerEmail}</p>
              <p className="text-muted-foreground">{order.customerPhone}</p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-none shadow-sm ring-1 ring-border">
            <CardHeader>
              <CardTitle>Shipping address</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground">{order.shipFullName}</p>
              <p>{order.shipPhone}</p>
              <p>
                {order.shipLine1}
                {order.shipLine2 ? `, ${order.shipLine2}` : ""}
              </p>
              <p>
                {order.shipCity}, {order.shipState} {order.shipPincode}
              </p>
              {order.courier ? (
                <p className="mt-2 text-foreground">
                  {order.courier} · {order.trackingNumber}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: React.ReactNode;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between ${strong ? "border-t border-border pt-2 font-semibold text-foreground" : "text-muted-foreground"}`}
    >
      <span>{label}</span>
      <span className={strong ? "text-foreground" : undefined}>{value}</span>
    </div>
  );
}
