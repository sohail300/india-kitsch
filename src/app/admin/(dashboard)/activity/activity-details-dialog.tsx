"use client";

import { useState } from "react";
import { ChevronDownIcon, EyeIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ActivityChange } from "./present";

/**
 * One entry's details: every changed field as before → after, and the
 * stored snapshot as JSON behind "Show raw data". Everything arrives
 * pre-formatted from the server page.
 */
export function ActivityDetailsDialog({
  title,
  subtitle,
  changes,
  raw,
}: {
  title: string;
  subtitle: string;
  changes: ActivityChange[];
  raw: string;
}) {
  const [open, setOpen] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const hasBefore = changes.some((c) => c.before !== null);
  const hasAfter = changes.some((c) => c.after !== null);
  // A create or delete has only one side: label it "Value" rather than Before/After.
  const singleSide = hasBefore !== hasAfter;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setShowRaw(false);
      }}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="View details"
              onClick={() => setOpen(true)}
            >
              <EyeIcon />
            </Button>
          }
        />
        <TooltipContent>View details</TooltipContent>
      </Tooltip>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{subtitle}</DialogDescription>
        </DialogHeader>

        {changes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No field changes to show.</p>
        ) : (
          <div className="max-h-80 overflow-auto rounded-xl ring-1 ring-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Field</th>
                  {singleSide ? (
                    <th className="px-3 py-2 font-medium">Value</th>
                  ) : (
                    <>
                      <th className="px-3 py-2 font-medium">Before</th>
                      <th className="px-3 py-2 font-medium">After</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {changes.map((c) => (
                  <tr key={c.label} className="border-t border-border align-top">
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{c.label}</td>
                    {singleSide ? (
                      <td className="px-3 py-2 break-words">{c.after ?? c.before}</td>
                    ) : (
                      <>
                        <td className="px-3 py-2 break-words text-muted-foreground">{c.before}</td>
                        <td className="px-3 py-2 font-medium break-words">{c.after}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            aria-expanded={showRaw}
            onClick={() => setShowRaw((v) => !v)}
          >
            <ChevronDownIcon className={cn("transition-transform", showRaw && "rotate-180")} />
            {showRaw ? "Hide raw data" : "Show raw data"}
          </Button>
          {showRaw ? (
            <pre className="max-h-72 overflow-auto rounded-xl bg-muted p-3 font-mono text-xs leading-relaxed">
              {raw}
            </pre>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
