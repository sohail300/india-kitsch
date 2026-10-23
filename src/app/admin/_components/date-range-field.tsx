"use client";

import { useState } from "react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { CalendarIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { parseDateValue } from "./date-picker-field";

const VALUE_FORMAT = "yyyy-MM-dd";

/**
 * A from–to date range for GET filter forms, using the same Popover +
 * Calendar as the dashboard's custom range. Submits as two hidden inputs
 * (`yyyy-MM-dd`, empty when unset), so the page keeps reading plain
 * `?from=&to=` params and turns them into store-time day bounds itself.
 */
export function DateRangeField({
  fromName = "from",
  toName = "to",
  defaultFrom = "",
  defaultTo = "",
  placeholder = "Any date",
}: {
  fromName?: string;
  toName?: string;
  defaultFrom?: string;
  defaultTo?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>(() => {
    const from = parseDateValue(defaultFrom);
    const to = parseDateValue(defaultTo);
    return from || to ? { from, to } : undefined;
  });

  const label =
    range?.from && range?.to
      ? `${format(range.from, "MMM d")} – ${format(range.to, "MMM d, yyyy")}`
      : range?.from
        ? `From ${format(range.from, "MMM d, yyyy")}`
        : placeholder;

  return (
    <div className="flex w-full items-center sm:w-auto">
      <input
        type="hidden"
        name={fromName}
        value={range?.from ? format(range.from, VALUE_FORMAT) : ""}
      />
      <input type="hidden" name={toName} value={range?.to ? format(range.to, VALUE_FORMAT) : ""} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              className={cn(
                "w-full justify-start font-normal sm:w-auto sm:min-w-52",
                !range?.from && "text-muted-foreground",
              )}
            >
              <CalendarIcon />
              {label}
            </Button>
          }
        />
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            selected={range}
            onSelect={setRange}
            defaultMonth={range?.from}
            numberOfMonths={2}
          />
          <div className="flex justify-between gap-2 border-t border-border p-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setRange(undefined)}>
              Clear dates
            </Button>
            <Button type="button" size="sm" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      {range?.from ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="-ml-1"
          aria-label="Clear dates"
          onClick={() => setRange(undefined)}
        >
          <XIcon />
        </Button>
      ) : null}
    </div>
  );
}
