"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RANGE_OPTIONS } from "./dashboard-ranges";

const URL_DATE_FORMAT = "yyyy-MM-dd";

function parseUrlDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * Drives the dashboard's period metrics entirely through the URL (`range`,
 * plus `from`/`to` for a custom range) - the page itself stays a plain
 * Server Component that re-queries on navigation, same pattern the
 * Orders/Products/Inventory filter forms already use, just with an
 * auto-navigating single control instead of a submit button since there's
 * only one field to change most of the time.
 */
export function DashboardRangeSelect({
  range,
  from,
  to,
}: {
  range: string;
  from?: string;
  to?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Separate from the `range` prop (URL-derived): selecting "Custom" needs
  // to reveal the calendar immediately, before Apply navigates - the prop
  // only changes once the URL actually does.
  const [selectedRange, setSelectedRange] = useState(range);
  const [draft, setDraft] = useState<DateRange | undefined>({
    from: parseUrlDate(from),
    to: parseUrlDate(to),
  });
  const [popoverOpen, setPopoverOpen] = useState(false);

  function navigate(next: { range: string; from?: string; to?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", next.range);
    if (next.range === "custom") {
      if (next.from) params.set("from", next.from);
      else params.delete("from");
      if (next.to) params.set("to", next.to);
      else params.delete("to");
    } else {
      params.delete("from");
      params.delete("to");
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Select
        items={RANGE_OPTIONS}
        value={selectedRange}
        onValueChange={(value) => {
          if (!value) return;
          setSelectedRange(value);
          if (value !== "custom") navigate({ range: value });
        }}
      >
        <SelectTrigger className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {RANGE_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selectedRange === "custom" ? (
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger
            render={
              <Button variant="outline">
                <CalendarIcon />
                {draft?.from && draft?.to
                  ? `${format(draft.from, "MMM d")} – ${format(draft.to, "MMM d, yyyy")}`
                  : "Pick dates"}
              </Button>
            }
          />
          <PopoverContent className="w-auto p-0">
            <Calendar
              mode="range"
              selected={draft}
              onSelect={setDraft}
              defaultMonth={draft?.from}
              numberOfMonths={2}
            />
            <div className="flex justify-end border-t border-border p-2">
              <Button
                disabled={!draft?.from || !draft?.to}
                onClick={() => {
                  if (!draft?.from || !draft?.to) return;
                  navigate({
                    range: "custom",
                    from: format(draft.from, URL_DATE_FORMAT),
                    to: format(draft.to, URL_DATE_FORMAT),
                  });
                  setPopoverOpen(false);
                }}
              >
                Apply
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}
