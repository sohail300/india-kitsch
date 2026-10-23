"use client";

import { useState } from "react";
import { format } from "date-fns";
import type { Matcher } from "react-day-picker";
import { CalendarIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const VALUE_FORMAT = "yyyy-MM-dd";

/** Parses a `yyyy-MM-dd` value as local midnight (`new Date("yyyy-MM-dd")` alone would be UTC). */
export function parseDateValue(value?: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * A single optional date, picked with the same Popover + Calendar pair as
 * the dashboard's custom range. The value is a `yyyy-MM-dd` string ("" when
 * empty) so it drops into react-hook-form string fields unchanged.
 */
export function DatePickerField({
  id,
  value,
  onChange,
  placeholder = "Pick a date",
  disabled,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: Matcher | Matcher[];
}) {
  const [open, setOpen] = useState(false);
  const selected = parseDateValue(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            variant="outline"
            className={cn("w-full justify-start font-normal", !selected && "text-muted-foreground")}
          >
            <CalendarIcon />
            {selected ? format(selected, "MMM d, yyyy") : placeholder}
          </Button>
        }
      />
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => {
            onChange(date ? format(date, VALUE_FORMAT) : "");
            setOpen(false);
          }}
          defaultMonth={selected}
          disabled={disabled}
        />
        {selected ? (
          <div className="flex justify-end border-t border-border p-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              Clear
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
