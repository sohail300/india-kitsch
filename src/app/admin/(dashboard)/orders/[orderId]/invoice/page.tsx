import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/server/db/client";
import { getStoreInfo } from "@/server/modules/settings/queries";
import { formatINR } from "@/server/lib/money";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Invoice - India Kitsch Admin" };

export default async function InvoicePage(props: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await props.params;

  const [order, storeInfo] = await Promise.all([
    db.query.orders.findFirst({
      where: (o, { eq }) => eq(o.id, orderId),
      with: { items: true },
    }),
    getStoreInfo(),
  ]);
  if (!order) notFound();

  return (
    <div className="mx-auto max-w-2xl bg-white p-8 text-sm text-neutral-900 print:p-0">
      <div className="print:hidden">
        <PrintButton />
      </div>

      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold">India Kitsch</h1>
          <p className="text-neutral-500">{storeInfo.sellerState}</p>
          <p className="text-neutral-500">{storeInfo.contactEmail}</p>
          {storeInfo.contactPhone ? (
            <p className="text-neutral-500">{storeInfo.contactPhone}</p>
          ) : null}
          {storeInfo.gstin ? <p className="text-neutral-500">GSTIN: {storeInfo.gstin}</p> : null}
        </div>
        <div className="text-right">
          <h2 className="text-lg font-semibold">Invoice</h2>
          <p className="text-neutral-500">IK-{order.orderNumber}</p>
          <p className="text-neutral-500">{new Date(order.createdAt).toLocaleDateString()}</p>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-8">
        <div>
          <p className="mb-1 font-semibold text-neutral-700">Bill / ship to</p>
          <p>{order.shipFullName}</p>
          <p>{order.shipPhone}</p>
          <p>
            {order.shipLine1}
            {order.shipLine2 ? `, ${order.shipLine2}` : ""}
          </p>
          <p>
            {order.shipCity}, {order.shipState} {order.shipPincode}
          </p>
        </div>
        <div>
          <p className="mb-1 font-semibold text-neutral-700">Order details</p>
          <p>Status: {order.status.replace("_", " ")}</p>
          {order.courier ? (
            <p>
              {order.courier} - {order.trackingNumber}
            </p>
          ) : null}
        </div>
      </div>

      <table className="mb-8 w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-neutral-300 text-xs tracking-wide text-neutral-500 uppercase">
            <th className="py-2">Item</th>
            <th className="py-2">HSN</th>
            <th className="py-2 text-right">Qty</th>
            <th className="py-2 text-right">Unit price</th>
            <th className="py-2 text-right">GST</th>
            <th className="py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.id} className="border-b border-neutral-200">
              <td className="py-2">
                {item.productName}
                <span className="block text-xs text-neutral-500">
                  {item.size} / {item.color} · {item.sku}
                </span>
              </td>
              <td className="py-2">{item.hsnCode ?? "-"}</td>
              <td className="py-2 text-right">{item.quantity}</td>
              <td className="py-2 text-right">{formatINR(item.unitPricePaise)}</td>
              <td className="py-2 text-right">{item.gstRateBps / 100}%</td>
              <td className="py-2 text-right">{formatINR(item.lineTotalPaise)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ml-auto flex w-56 flex-col gap-1">
        <div className="flex justify-between text-neutral-600">
          <span>Subtotal</span>
          <span>{formatINR(order.subtotalPaise)}</span>
        </div>
        {order.discountPaise > 0 ? (
          <div className="flex justify-between text-neutral-600">
            <span>Discount</span>
            <span>-{formatINR(order.discountPaise)}</span>
          </div>
        ) : null}
        <div className="flex justify-between text-neutral-600">
          <span>Shipping</span>
          <span>{formatINR(order.shippingPaise)}</span>
        </div>
        <div className="flex justify-between text-neutral-600">
          <span>GST (included)</span>
          <span>{formatINR(order.taxIncludedPaise)}</span>
        </div>
        <div className="flex justify-between border-t border-neutral-300 pt-1 font-semibold">
          <span>Total</span>
          <span>{formatINR(order.totalPaise)}</span>
        </div>
      </div>

      <p className="mt-12 text-center text-xs text-neutral-400">
        This is a system-generated invoice for India Kitsch order IK-{order.orderNumber}.
      </p>
    </div>
  );
}
