"use client";

import type { ReactElement } from "react";
import { DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * A dialog's trigger, optionally with a hover/focus tooltip — for icon-only
 * buttons (e.g. the ✏️ edit buttons), which need a visible name. The tooltip
 * trigger renders the dialog trigger, which renders the button, so one
 * element carries both behaviours.
 */
export function TooltipDialogTrigger({
  trigger,
  tooltip,
}: {
  trigger: ReactElement;
  tooltip?: string;
}) {
  if (!tooltip) return <DialogTrigger render={trigger} />;
  return (
    <Tooltip>
      <TooltipTrigger render={<DialogTrigger render={trigger} />} />
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
