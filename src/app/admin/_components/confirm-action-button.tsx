"use client";

import { useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/app/admin/_lib/action-result";
import { useAdminAction } from "@/app/admin/_lib/use-admin-action";

/** A button that asks for confirmation before running an admin action - used for anything that isn't trivially reversible (docs/07 §13: cancel order, refund, disable customer). */
export function ConfirmActionButton({
  label,
  title,
  description,
  confirmLabel = "Confirm",
  variant = "default",
  action,
  successMessage,
  disabled,
}: {
  label: ReactNode;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  variant?: "default" | "destructive";
  action: () => Promise<ActionResult<unknown>>;
  successMessage?: string;
  disabled?: boolean;
}) {
  const { run, isPending } = useAdminAction();
  const [open, setOpen] = useState(false);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            variant={variant === "destructive" ? "destructive" : "outline"}
            disabled={disabled}
          >
            {label}
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={async () => {
              const result = await run(action(), { successMessage });
              if (result.ok) setOpen(false);
            }}
            className={
              variant === "destructive"
                ? "bg-destructive text-white hover:bg-destructive/90"
                : undefined
            }
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
