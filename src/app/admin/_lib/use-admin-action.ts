"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "./action-result";

/**
 * Runs an admin Server Action from a client component, wiring it to a
 * pending state plus a toast on success/failure. Callers `await` the
 * returned promise when they need the result (close a dialog, redirect to
 * a freshly created record); fire-and-forget buttons can ignore it.
 */
export function useAdminAction() {
  const [isPending, startTransition] = useTransition();

  function run<T>(
    promise: Promise<ActionResult<T>>,
    options?: { successMessage?: string; silent?: boolean },
  ): Promise<ActionResult<T>> {
    return new Promise((resolve) => {
      startTransition(async () => {
        const result = await promise;
        if (result.ok) {
          if (!options?.silent) toast.success(options?.successMessage ?? "Saved");
        } else {
          toast.error(result.error);
        }
        resolve(result);
      });
    });
  }

  return { run, isPending };
}
