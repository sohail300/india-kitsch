"use client";

import { useState } from "react";
import { Trash2Icon } from "lucide-react";
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
import { deleteVariantAction } from "../actions";

/**
 * Delete one size & colour. Only possible if it has never been ordered and
 * nothing is in checkout — otherwise the button is disabled with the reason
 * on hover (and the server enforces the same rules). Pausing is the
 * alternative that always works.
 */
export function DeleteVariantButton({
  variantId,
  productId,
  label,
  inStock,
  blockedReason,
}: {
  variantId: string;
  productId: string;
  /** "M / White" */
  label: string;
  inStock: number;
  /** Why it can't be deleted right now, if it can't. */
  blockedReason?: string;
}) {
  const { run, isPending } = useAdminAction();
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (blockedReason) {
    return (
      <Tooltip>
        {/* A disabled button gets no pointer events, so the tooltip hangs off a wrapper. */}
        <TooltipTrigger render={<span className="inline-flex" tabIndex={0} />}>
          <Button
            variant="destructive-outline"
            size="icon-sm"
            disabled
            aria-label={`Delete ${label}`}
          >
            <Trash2Icon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{blockedReason}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="destructive-outline"
              size="icon-sm"
              aria-label={`Delete ${label}`}
              onClick={() => setConfirmOpen(true)}
            >
              <Trash2Icon />
            </Button>
          }
        />
        <TooltipContent>Delete</TooltipContent>
      </Tooltip>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {label}?</AlertDialogTitle>
          <AlertDialogDescription>
            {inStock > 0
              ? `Its ${inStock} in stock and its stock history are removed too. `
              : "Its stock history is removed too. "}
            This can&apos;t be undone. To just stop selling it, pause it instead.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={async () => {
              const result = await run(deleteVariantAction(variantId, productId), {
                successMessage: `${label} deleted`,
              });
              if (result.ok) setConfirmOpen(false);
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
