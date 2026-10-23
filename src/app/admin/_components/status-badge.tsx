import { cn } from "@/lib/utils";

type Tone = "neutral" | "info" | "success" | "warning" | "destructive";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-secondary text-secondary-foreground",
  info: "bg-accent text-accent-foreground",
  success: "bg-success/10 text-success",
  warning: "bg-warning/15 text-warning-foreground",
  destructive: "bg-destructive/10 text-destructive",
};

const ORDER_STATUS_TONE: Record<string, Tone> = {
  pending_payment: "warning",
  paid: "info",
  processing: "info",
  shipped: "success",
  delivered: "success",
  cancelled: "neutral",
  refunded: "destructive",
  not_paid: "neutral",
};

const PRODUCT_STATUS_TONE: Record<string, Tone> = {
  draft: "neutral",
  active: "success",
  archived: "destructive",
};

export const ORDER_STATUS_LABEL: Record<string, string> = {
  pending_payment: "Awaiting payment",
  paid: "Paid",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
  not_paid: "Not paid",
};

/**
 * The status to *show* for an order. A checkout the customer never paid for
 * is auto-cancelled after the 5-minute hold with `cancelReason = "expired"`
 * (orders/service.ts, payments/reconcile.ts) — that isn't a real
 * cancellation, so it's shown as "Not paid", apart from Cancelled. Display
 * only: the stored status stays `cancelled`, which the late-payment path
 * (payments/settle.ts) relies on.
 */
export function displayOrderStatus(status: string, cancelReason: string | null): string {
  return status === "cancelled" && cancelReason === "expired" ? "not_paid" : status;
}

function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap",
        TONE_CLASSES[tone],
      )}
    >
      {children}
    </span>
  );
}

export function OrderStatusBadge({ status }: { status: string }) {
  return (
    <Pill tone={ORDER_STATUS_TONE[status] ?? "neutral"}>
      {ORDER_STATUS_LABEL[status] ?? status}
    </Pill>
  );
}

// Owner-facing wording (stored values stay draft/active/archived).
const PRODUCT_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  active: "Live",
  archived: "Archived",
};

export function ProductStatusBadge({ status }: { status: string }) {
  return (
    <Pill tone={PRODUCT_STATUS_TONE[status] ?? "neutral"}>
      {PRODUCT_STATUS_LABEL[status] ?? status}
    </Pill>
  );
}

export function BooleanBadge({
  value,
  trueLabel,
  falseLabel,
}: {
  value: boolean;
  trueLabel: string;
  falseLabel: string;
}) {
  return <Pill tone={value ? "success" : "neutral"}>{value ? trueLabel : falseLabel}</Pill>;
}

const COUPON_STATUS: Record<string, { tone: Tone; label: string }> = {
  live: { tone: "success", label: "Live" },
  scheduled: { tone: "info", label: "Scheduled" },
  used_up: { tone: "warning", label: "Used up" },
  expired: { tone: "destructive", label: "Expired" },
  inactive: { tone: "neutral", label: "Inactive" },
};

export function CouponStatusBadge({ status }: { status: string }) {
  const { tone, label } = COUPON_STATUS[status] ?? { tone: "neutral" as const, label: status };
  return <Pill tone={tone}>{label}</Pill>;
}
