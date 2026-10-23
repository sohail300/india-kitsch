import Link from "next/link";
import { CheckIcon, LockIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type SetupStep = "details" | "sizes" | "photos";

const STEPS: { key: SetupStep; label: string }[] = [
  { key: "details", label: "Details" },
  { key: "sizes", label: "Sizes & colours" },
  { key: "photos", label: "Photos" },
];

export type StepsMode = "setup" | "edit";

/** Where each step lives once the product exists — the product page in setup mode. */
export function setupStepHref(productId: string, step: SetupStep): string {
  return `/admin/products/${productId}?setup=${step}`;
}

/** The same three sections when editing an existing product (Details is the default). */
export function editStepHref(productId: string, step: SetupStep): string {
  return step === "details"
    ? `/admin/products/${productId}`
    : `/admin/products/${productId}?step=${step}`;
}

export function stepHref(mode: StepsMode, productId: string, step: SetupStep): string {
  return mode === "setup" ? setupStepHref(productId, step) : editStepHref(productId, step);
}

/**
 * New-product setup as three steps: Details → Sizes & colours → Photos.
 * Before the product is created only step 1 is reachable (sizes and photos
 * attach to a saved product), so steps 2–3 show locked. Afterwards every
 * step is a link, so the owner can go back to an earlier one.
 */
export function ProductSetupSteps({
  current,
  productId,
  mode = "setup",
  counts,
}: {
  current: SetupStep;
  /** Unset on the New product page, before step 1 is saved. */
  productId?: string;
  /**
   * "setup": new-product flow, earlier steps get a ✓. "edit": the same bar on
   * an existing product's page — every section is simply a link, any order.
   */
  mode?: StepsMode;
  /** Shown after a label, e.g. "Sizes & colours (6)". */
  counts?: Partial<Record<SetupStep, number>>;
}) {
  const currentIndex = STEPS.findIndex((s) => s.key === current);

  return (
    <nav aria-label={mode === "setup" ? "Product setup" : "Product sections"}>
      {/* Below sm: a plain vertical list, no connector lines - flex-wrap
          can't tell a connector "belongs" between two items only when
          they share a row, so once a step wraps to its own line, the
          connector before it floats there disconnected (what the mobile
          screenshot showed). At sm+, all three steps fit one row, so the
          horizontal layout with connectors is unambiguous again. */}
      <ol className="flex flex-col items-start gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2 sm:gap-y-2">
        {STEPS.map((step, index) => {
          const isCurrent = step.key === current;
          const isDone = mode === "setup" && index < currentIndex;
          const locked = !productId && index > 0;
          const content = (
            <>
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  isCurrent && "bg-primary text-primary-foreground",
                  isDone && "bg-accent text-accent-foreground",
                  !isCurrent && !isDone && "bg-muted text-muted-foreground",
                )}
              >
                {isDone ? <CheckIcon className="size-3.5" /> : index + 1}
              </span>
              <span
                className={cn(
                  "text-sm whitespace-nowrap",
                  isCurrent ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {step.label}
                {counts?.[step.key] !== undefined ? ` (${counts[step.key]})` : null}
              </span>
              {locked ? (
                <LockIcon className="size-3 text-muted-foreground" aria-label="(after step 1)" />
              ) : null}
            </>
          );

          return (
            <li key={step.key} className="flex items-center gap-2">
              {index > 0 ? (
                <span aria-hidden className="hidden h-px w-6 bg-border sm:block sm:w-10" />
              ) : null}
              {productId && !isCurrent ? (
                <Link
                  href={stepHref(mode, productId, step.key)}
                  className="flex items-center gap-2 rounded-md px-1 py-0.5 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {content}
                </Link>
              ) : (
                <span
                  className="flex items-center gap-2 px-1 py-0.5"
                  aria-current={isCurrent ? "step" : undefined}
                >
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
