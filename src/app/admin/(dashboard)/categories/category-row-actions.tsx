"use client";

import { useState } from "react";
import { PencilIcon, Trash2Icon } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAdminAction } from "@/app/admin/_lib/use-admin-action";
import { deleteCategoryAction, setCategoryActiveAction } from "./actions";
import { CategoryFormDialog, type CategoryFormInitial } from "./category-form-dialog";

/**
 * Showing/hiding a category changes the storefront (its page, its menu link
 * and all its products), so it asks first - in both directions, same as the
 * coupon Active switch. The switch doesn't move until confirmed.
 */
export function CategoryActiveSwitch({
  id,
  name,
  productCount,
  isActive,
}: {
  id: string;
  name: string;
  productCount: number;
  isActive: boolean;
}) {
  const { run, isPending } = useAdminAction();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const next = !isActive;
  const products = `${productCount} ${productCount === 1 ? "product" : "products"}`;

  return (
    <>
      <Switch
        checked={isActive}
        disabled={isPending}
        onCheckedChange={() => setConfirmOpen(true)}
        aria-label={`${name} visible`}
      />
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {next ? "Show" : "Hide"} {name} {next ? "on" : "from"} the store?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {next
                ? `Its page and menu link come back, and its ${products} can be browsed and bought again.`
                : `Its page and menu link disappear, and its ${products} can't be browsed or bought. Nothing is deleted - you can show it again anytime.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onClick={async () => {
                const result = await run(setCategoryActiveAction(id, next), {
                  successMessage: next ? "Category shown" : "Category hidden",
                });
                if (result.ok) setConfirmOpen(false);
              }}
            >
              {next ? "Show" : "Hide"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function CategoryEditButton({ category }: { category: CategoryFormInitial }) {
  return (
    <CategoryFormDialog
      trigger={
        <Button variant="ghost" size="icon-sm" aria-label={`Edit ${category.name}`}>
          <PencilIcon />
        </Button>
      }
      tooltip="Edit category"
      initial={category}
    />
  );
}

/**
 * Only an empty category can be deleted - the button is disabled (with the
 * reason on hover) while it still has products, and the server enforces the
 * same rule. Deleting can't be undone, so it confirms in the destructive style.
 */
export function CategoryDeleteButton({
  id,
  name,
  productCount,
}: {
  id: string;
  name: string;
  productCount: number;
}) {
  const { run, isPending } = useAdminAction();
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (productCount > 0) {
    return (
      <Tooltip>
        {/* A disabled button gets no pointer events, so the tooltip hangs off a wrapper. */}
        <TooltipTrigger render={<span className="inline-flex" tabIndex={0} />}>
          <Button
            variant="destructive-outline"
            size="icon-sm"
            disabled
            aria-label={`Delete ${name}`}
          >
            <Trash2Icon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          Move or delete its {productCount} {productCount === 1 ? "product" : "products"} first
        </TooltipContent>
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
              aria-label={`Delete ${name}`}
              onClick={() => setConfirmOpen(true)}
            >
              <Trash2Icon />
            </Button>
          }
        />
        <TooltipContent>Delete category</TooltipContent>
      </Tooltip>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            This category has no products. Deleting it removes it permanently - this can&apos;t be
            undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={async () => {
              const result = await run(deleteCategoryAction(id), {
                successMessage: "Category deleted",
              });
              if (result.ok) setConfirmOpen(false);
            }}
          >
            Delete category
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
