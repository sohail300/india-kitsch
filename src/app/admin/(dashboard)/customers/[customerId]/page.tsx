import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, ArrowRightIcon, MapPinIcon, ShoppingCartIcon } from "lucide-react";
import { getCustomerDetail } from "@/server/modules/customers/queries";
import { formatINR } from "@/server/lib/money";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/app/admin/_components/page-header";
import { EmptyState } from "@/app/admin/_components/empty-state";
import { DataTable } from "@/app/admin/_components/data-table";
import {
  BooleanBadge,
  displayOrderStatus,
  OrderStatusBadge,
} from "@/app/admin/_components/status-badge";
import { formatAdminDate, formatAdminDateTime } from "@/app/admin/_lib/format-date";
import { CustomerDisableButton } from "./customer-disable-button";

export const metadata: Metadata = { title: "Customer - India Kitsch Admin" };

export default async function CustomerDetailPage(props: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await props.params;
  const detail = await getCustomerDetail(customerId);
  if (!detail) notFound();

  const { customer, addresses, orders, disabledBy } = detail;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          render={<Link href="/admin/customers" />}
          className="mb-2"
        >
          <ArrowLeftIcon /> Customers
        </Button>
        <PageHeader
          title={customer.name}
          description={customer.email}
          actions={
            <CustomerDisableButton
              customerId={customer.id}
              disabled={customer.disabled}
              customerName={customer.name}
            />
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="rounded-2xl border-none shadow-sm ring-1 ring-border lg:col-span-1">
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <BooleanBadge value={!customer.disabled} trueLabel="Active" falseLabel="Disabled" />
            </div>
            {disabledBy ? (
              <p className="-mt-1 text-right text-xs text-muted-foreground">
                by {disabledBy.adminEmail} · {formatAdminDateTime(disabledBy.at)}
              </p>
            ) : null}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Phone</span>
              <span className="text-foreground">{customer.phone ?? "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email verified</span>
              <BooleanBadge
                value={customer.emailVerified}
                trueLabel="Verified"
                falseLabel="Unverified"
              />
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Joined</span>
              <span className="text-foreground">{formatAdminDate(customer.createdAt)}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-none shadow-sm ring-1 ring-border lg:col-span-2">
          <CardHeader>
            <CardTitle>Addresses</CardTitle>
          </CardHeader>
          <CardContent>
            {addresses.length === 0 ? (
              <EmptyState icon={MapPinIcon} title="No saved addresses" />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {addresses.map((address) => (
                  <div key={address.id} className="rounded-xl border border-border p-3 text-sm">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="font-medium text-foreground">{address.fullName}</span>
                      {address.isDefault ? (
                        <span className="text-xs font-medium text-primary">Default</span>
                      ) : null}
                    </div>
                    <p className="text-muted-foreground">
                      {address.line1}
                      {address.line2 ? `, ${address.line2}` : ""}
                      <br />
                      {address.city}, {address.state} {address.pincode}
                      <br />
                      {address.phone}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border-none shadow-sm ring-1 ring-border">
        <CardHeader className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Recent orders</CardTitle>
          {orders.length > 0 ? (
            <CardAction className="self-auto">
              {/* Orders search matches the email snapshotted on each order. */}
              <Button
                variant="ghost"
                size="sm"
                render={<Link href={`/admin/orders?q=${encodeURIComponent(customer.email)}`} />}
              >
                View all orders <ArrowRightIcon />
              </Button>
            </CardAction>
          ) : null}
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <EmptyState icon={ShoppingCartIcon} title="No orders yet" />
          ) : (
            <DataTable
              headers={["Order", "Date", "Status", "Total"]}
              headerClassNames={[undefined, undefined, undefined, "text-right"]}
              rows={orders.map((order) => ({
                key: order.id,
                cells: [
                  <Link
                    key="order"
                    href={`/admin/orders/${order.id}`}
                    className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
                  >
                    IK-{order.orderNumber}
                  </Link>,
                  formatAdminDate(order.createdAt),
                  <OrderStatusBadge
                    key="status"
                    status={displayOrderStatus(order.status, order.cancelReason)}
                  />,
                  <span key="total" className="block text-right font-medium text-foreground">
                    {formatINR(order.totalPaise)}
                  </span>,
                ],
              }))}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
