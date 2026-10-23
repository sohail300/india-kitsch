"use client";

import { useState } from "react";
import { PackageCheckIcon, PackageOpenIcon } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAdminAction } from "@/app/admin/_lib/use-admin-action";
import type { ActionResult } from "@/app/admin/_lib/action-result";
import { markOrderDeliveredAction, markOrderProcessingAction } from "./actions";
import { MarkShippedDialog } from "./[orderId]/order-status-actions";

/**
 * Inline row actions for the next status step: paid → processing,
 * processing → shipped (opens the courier/tracking dialog), shipped →
 * delivered. An order's status only moves forward, so each asks first.
 * Refund/cancel stay on the order page.
 */
export function OrderRowActions({
  orderId,
  orderNumber,
  status,
}: {
  orderId: string;
  orderNumber: number;
  status: string;
}) {
  if (status === "paid") {
    return (
      <ConfirmStatusButton
        icon={<PackageOpenIcon />}
        tooltip="Mark as processing"
        title={`Mark IK-${orderNumber} as processing?`}
        description="Use this once you've started packing it. An order's status only moves forward, so this can't be undone."
        confirmLabel="Mark as processing"
        successMessage="Order marked processing"
        action={() => markOrderProcessingAction(orderId)}
      />
    );
  }
  if (status === "processing") {
    return <MarkShippedDialog orderId={orderId} orderNumber={orderNumber} compact />;
  }
  if (status === "shipped") {
    return (
      <ConfirmStatusButton
        icon={<PackageCheckIcon />}
        tooltip="Mark as delivered"
        title={`Mark IK-${orderNumber} as delivered?`}
        description="Use this once the courier has delivered it. The customer is emailed that it has arrived. An order's status only moves forward, so this can't be undone."
        confirmLabel="Mark as delivered"
        successMessage="Order marked delivered"
        action={() => markOrderDeliveredAction(orderId)}
      />
    );
  }
  return null;
}

function ConfirmStatusButton({
  icon,
  tooltip,
  title,
  description,
  confirmLabel,
  successMessage,
  action,
}: {
  icon: React.ReactNode;
  tooltip: string;
  title: string;
  description: string;
  confirmLabel: string;
  successMessage: string;
  action: () => Promise<ActionResult<unknown>>;
}) {
  const { run, isPending } = useAdminAction();
  const [open, setOpen] = useState(false);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={tooltip}
              disabled={isPending}
              onClick={() => setOpen(true)}
            >
              {icon}
            </Button>
          }
        />
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={async () => {
              const result = await run(action(), { successMessage });
              if (result.ok) setOpen(false);
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
