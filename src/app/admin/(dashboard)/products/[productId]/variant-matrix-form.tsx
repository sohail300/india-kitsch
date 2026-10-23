"use client";

import { useState } from "react";
import { CheckIcon, InfoIcon, PlusIcon, TrashIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAdminAction } from "@/app/admin/_lib/use-admin-action";
import { generateVariantMatrixAction } from "../actions";

const PRESET_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "Free size"];

interface ColorRow {
  name: string;
  hex: string;
}

const key = (size: string, color: string) => `${size}::${color}`;

/** Mirrors the server's SKU rule (catalog/admin.ts `toSku`) — shown as a preview only. */
function toSku(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Add sizes & colours to a product: pick sizes (preset chips + custom),
 * name colours with a swatch, and enter each new unit's starting stock in
 * one grid. SKUs are generated from the product's slug — owners never type
 * one. Combinations that already exist are shown but skipped.
 */
export function VariantMatrixForm({
  productId,
  productSlug,
  existingPairs,
}: {
  productId: string;
  productSlug: string;
  /** `size::color` keys that already exist on this product. */
  existingPairs: string[];
}) {
  const { run, isPending } = useAdminAction();
  const [sizes, setSizes] = useState<string[]>([]);
  const [customSize, setCustomSize] = useState("");
  const [colors, setColors] = useState<ColorRow[]>([{ name: "", hex: "#ffffff" }]);
  const [stock, setStock] = useState<Record<string, string>>({});
  const existing = new Set(existingPairs);

  const namedColors = colors.map((c) => ({ ...c, name: c.name.trim() })).filter((c) => c.name);
  const newPairs = sizes.flatMap((size) =>
    namedColors.filter((c) => !existing.has(key(size, c.name))).map((c) => ({ size, color: c })),
  );

  function toggleSize(size: string) {
    setSizes((prev) => (prev.includes(size) ? prev.filter((s) => s !== size) : [...prev, size]));
  }

  function addCustomSize() {
    const size = customSize.trim();
    if (size && !sizes.includes(size)) setSizes((prev) => [...prev, size]);
    setCustomSize("");
  }

  function updateColor(index: number, patch: Partial<ColorRow>) {
    setColors((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  async function onCreate() {
    if (newPairs.length === 0) return;
    const result = await run(
      generateVariantMatrixAction({
        productId,
        sizes,
        colors: namedColors.map((c) => ({ name: c.name, hex: c.hex })),
        startingStock: newPairs.map(({ size, color }) => ({
          size,
          color: color.name,
          quantity: Math.max(0, Math.floor(Number(stock[key(size, color.name)]) || 0)),
        })),
      }),
      { silent: true },
    );
    if (result.ok) {
      const n = result.data.created.length;
      toast.success(`Added ${n} size & colour${n === 1 ? "" : "s"}`);
      setSizes([]);
      setColors([{ name: "", hex: "#ffffff" }]);
      setStock({});
    }
  }

  const customSizes = sizes.filter((s) => !PRESET_SIZES.includes(s));
  const skuExample =
    newPairs[0] && toSku(`${productSlug}-${newPairs[0].size}-${newPairs[0].color.name}`);

  return (
    <Card className="rounded-2xl border-none shadow-sm ring-1 ring-border">
      <CardHeader>
        <CardTitle className="text-base">Add sizes & colours</CardTitle>
        <CardDescription>
          Pick sizes and colours, then enter how many of each you have. Combinations that already
          exist are skipped.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {/* Sizes */}
        <div className="flex flex-col gap-2">
          <Label>Sizes</Label>
          <div className="flex flex-wrap gap-2">
            {[...PRESET_SIZES, ...customSizes].map((size) => {
              const selected = sizes.includes(size);
              return (
                <button
                  key={size}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleSize(size)}
                  className={cn(
                    "inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg border px-3 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    selected
                      ? "border-primary/40 bg-accent font-medium text-accent-foreground"
                      : "border-border bg-background text-foreground hover:bg-muted",
                  )}
                >
                  {selected ? <CheckIcon className="size-3.5" /> : null}
                  {size}
                </button>
              );
            })}
          </div>
          <div className="flex max-w-xs gap-2">
            <Input
              value={customSize}
              onChange={(e) => setCustomSize(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustomSize();
                }
              }}
              placeholder="Custom size (e.g. 32, 5-6Y)"
              maxLength={20}
              aria-label="Custom size"
            />
            <Button type="button" variant="outline" onClick={addCustomSize}>
              <PlusIcon /> Add
            </Button>
          </div>
        </div>

        {/* Colours */}
        <div className="flex flex-col gap-2">
          <Label>Colours</Label>
          <div className="flex flex-col gap-2 sm:max-w-md">
            {colors.map((color, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="color"
                  value={color.hex}
                  onChange={(e) => updateColor(i, { hex: e.target.value })}
                  aria-label={`Swatch for colour ${i + 1}`}
                  className="size-8 shrink-0 cursor-pointer rounded-md border border-input"
                />
                <Input
                  value={color.name}
                  onChange={(e) => updateColor(i, { name: e.target.value })}
                  placeholder="Colour name (e.g. Off White)"
                  maxLength={40}
                  aria-label={`Colour ${i + 1} name`}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove colour ${i + 1}`}
                  onClick={() => setColors((prev) => prev.filter((_, idx) => idx !== i))}
                  disabled={colors.length === 1}
                >
                  <TrashIcon />
                </Button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() => setColors((prev) => [...prev, { name: "", hex: "#ffffff" }])}
          >
            <PlusIcon /> Add colour
          </Button>
        </div>

        {/* Starting stock */}
        {sizes.length > 0 && namedColors.length > 0 ? (
          <div className="flex flex-col gap-2">
            <Label>Starting stock</Label>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="text-sm">
                <thead>
                  <tr className="bg-muted/40">
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                      Size
                    </th>
                    {namedColors.map((c) => (
                      <th
                        key={c.name}
                        className="px-3 py-2 text-left text-xs font-medium text-muted-foreground"
                      >
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                          <span
                            className="inline-block size-3 rounded-full ring-1 ring-border"
                            style={{ backgroundColor: c.hex }}
                          />
                          {c.name}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sizes.map((size) => (
                    <tr key={size} className="border-t border-border">
                      <td className="px-3 py-2 font-medium whitespace-nowrap">{size}</td>
                      {namedColors.map((c) => {
                        const k = key(size, c.name);
                        return (
                          <td key={k} className="px-3 py-2">
                            {existing.has(k) ? (
                              <span className="text-xs text-muted-foreground">Already added</span>
                            ) : (
                              <Input
                                type="number"
                                min={0}
                                step={1}
                                inputMode="numeric"
                                value={stock[k] ?? ""}
                                placeholder="0"
                                onChange={(e) =>
                                  setStock((prev) => ({ ...prev, [k]: e.target.value }))
                                }
                                aria-label={`Starting stock for ${size} / ${c.name}`}
                                className="w-20"
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Alert role="note" className="bg-muted/50">
              <InfoIcon />
              <AlertDescription>
                Leave a box empty for 0. You can adjust stock any time later from each row.
              </AlertDescription>
            </Alert>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={onCreate} disabled={isPending || newPairs.length === 0}>
            <PlusIcon />
            {newPairs.length > 0
              ? `Add ${newPairs.length} size & colour${newPairs.length === 1 ? "" : "s"}`
              : "Add sizes & colours"}
          </Button>
          {skuExample ? (
            <p className="text-xs text-muted-foreground">
              SKUs are created for you, e.g. <span className="font-mono">{skuExample}</span>
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
