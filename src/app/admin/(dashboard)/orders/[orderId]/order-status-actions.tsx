"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { PackageCheckIcon, PackageOpenIcon, TruckIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatINR } from "@/app/admin/_lib/money-client";
import { useAdminAction } from "@/app/admin/_lib/use-admin-action";
import { ConfirmActionButton } from "@/app/admin/_components/confirm-action-button";
import {
  cancelPaidOrderAction,
  markOrderDeliveredAction,
  markOrderProcessingAction,
  markOrderShippedAction,
} from "../actions";

// Status only moves forward, so these ask first (same wording as the list's row buttons).
export function MarkProcessingButton({
  orderId,
  orderNumber,
}: {
  orderId: string;
  orderNumber: number;
}) {
  return (
    <ConfirmActionButton
      label={
        <>
          <PackageOpenIcon /> Mark as processing
        </>
      }
      title={`Mark IK-${orderNumber} as processing?`}
      description="Use this once you've started packing it. An order's status only moves forward, so this can't be undone."
      confirmLabel="Mark as processing"
      successMessage="Order marked processing"
      action={() => markOrderProcessingAction(orderId)}
    />
  );
}

export function MarkDeliveredButton({
  orderId,
  orderNumber,
}: {
  orderId: string;
  orderNumber: number;
}) {
  return (
    <ConfirmActionButton
      label={
        <>
          <PackageCheckIcon /> Mark as delivered
        </>
      }
      title={`Mark IK-${orderNumber} as delivered?`}
      description="Use this once the courier has delivered it. The customer is emailed that it has arrived. An order's status only moves forward, so this can't be undone."
      confirmLabel="Mark as delivered"
      successMessage="Order marked delivered"
      action={() => markOrderDeliveredAction(orderId)}
    />
  );
}

const shipSchema = z.object({
  courier: z.string().trim().min(1, "Required"),
  trackingNumber: z.string().trim().min(1, "Required"),
  trackingUrl: z.string().trim().optional().or(z.literal("")),
});
type ShipFormValues = z.infer<typeof shipSchema>;

/**
 * `compact` renders an icon-only trigger with a tooltip, for the orders list's
 * row actions; the order page uses the full button.
 */
export function MarkShippedDialog({
  orderId,
  orderNumber,
  compact = false,
}: {
  orderId: string;
  orderNumber: number;
  compact?: boolean;
}) {
  const { run, isPending } = useAdminAction();
  const [open, setOpen] = useState(false);
  const form = useForm<ShipFormValues>({
    resolver: zodResolver(shipSchema),
    defaultValues: { courier: "", trackingNumber: "", trackingUrl: "" },
  });

  async function onSubmit(v: ShipFormValues) {
    const result = await run(
      markOrderShippedAction({
        orderId,
        courier: v.courier,
        trackingNumber: v.trackingNumber,
        trackingUrl: v.trackingUrl || undefined,
      }),
      { successMessage: "Order marked shipped" },
    );
    if (result.ok) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {compact ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Mark as shipped"
                disabled={isPending}
                onClick={() => setOpen(true)}
              >
                <TruckIcon />
              </Button>
            }
          />
          <TooltipContent>Mark as shipped</TooltipContent>
        </Tooltip>
      ) : (
        <DialogTrigger
          render={
            <Button>
              <TruckIcon /> Mark as shipped
            </Button>
          }
        />
      )}
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Mark IK-{orderNumber} as shipped</DialogTitle>
          <DialogDescription>
            The customer gets a shipping email once you save this.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="courier">Courier</Label>
            <Input id="courier" placeholder="Delhivery" {...form.register("courier")} />
            {form.formState.errors.courier ? (
              <p className="text-xs text-destructive">{form.formState.errors.courier.message}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="trackingNumber">Tracking number</Label>
            <Input id="trackingNumber" {...form.register("trackingNumber")} />
            {form.formState.errors.trackingNumber ? (
              <p className="text-xs text-destructive">
                {form.formState.errors.trackingNumber.message}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="trackingUrl">Tracking URL (optional)</Label>
            <Input id="trackingUrl" {...form.register("trackingUrl")} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              Confirm shipped
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CancelOrderButton({
  orderId,
  refundPaise,
}: {
  orderId: string;
  refundPaise: number;
}) {
  return (
    <ConfirmActionButton
      label="Cancel order"
      title="Cancel this order?"
      description={
        <>
          The customer will be refunded the full amount (
          <span className="font-semibold text-foreground">{formatINR(refundPaise)}</span>) and all
          items go back into stock. They&apos;re emailed about the cancellation. This can&apos;t be
          undone.
        </>
      }
      confirmLabel="Cancel order"
      variant="destructive"
      successMessage="Order cancelled and refunded"
      action={() => cancelPaidOrderAction({ orderId, reason: "Cancelled by admin" })}
    />
  );
}
