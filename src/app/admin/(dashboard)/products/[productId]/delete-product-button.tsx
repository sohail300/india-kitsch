"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { deleteProductAction } from "../actions";

/**
 * Delete a product that has never been ordered. One that has been ordered
 * can only be archived (the button is disabled, with the reason on hover),
 * and the server enforces the same rule.
 */
export function DeleteProductButton({
  productId,
  productName,
  hasOrders,
}: {
  productId: string;
  productName: string;
  hasOrders: boolean;
}) {
  const router = useRouter();
  const { run, isPending } = useAdminAction();
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (hasOrders) {
    return (
      <Tooltip>
        {/* A disabled button gets no pointer events, so the tooltip hangs off a wrapper. */}
        <TooltipTrigger render={<span className="inline-flex" tabIndex={0} />}>
          <Button variant="destructive-outline" disabled>
            <Trash2Icon /> Delete
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          It has been ordered, so it can&apos;t be deleted — archive it instead
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <Button variant="destructive-outline" onClick={() => setConfirmOpen(true)}>
        <Trash2Icon /> Delete
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {productName}?</AlertDialogTitle>
          <AlertDialogDescription>
            It has never been ordered. Its sizes &amp; colours, stock and photos are removed
            permanently — this can&apos;t be undone. To just take it off the store, set it to
            Archived instead.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={async () => {
              const result = await run(deleteProductAction(productId), {
                successMessage: "Product deleted",
              });
              if (result.ok) {
                setConfirmOpen(false);
                router.push("/admin/products");
              }
            }}
          >
            Delete product
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
