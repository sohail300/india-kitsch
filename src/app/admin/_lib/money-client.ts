/**
 * Client-safe mirrors of `server/lib/money.ts`'s rupee↔paise helpers. That
 * module is deliberately `import "server-only"` (it's the source of truth
 * for business-logic money handling), which means it can't be imported
 * from any `"use client"` form component - Turbopack's build fails on the
 * cross-boundary import otherwise. These three are pure UI-edge
 * conversions (docs/01 §1: "rupees ... only ever used at the UI edge, for
 * input/display"), safe to duplicate here rather than relax the guard.
 */

export function toPaise(rupees: number): number {
  if (!Number.isFinite(rupees) || rupees < 0) {
    throw new Error(`rupees must be a non-negative finite number, got ${rupees}`);
  }
  return Math.round(rupees * 100);
}

export function toRupees(paise: number): number {
  return paise / 100;
}

export function formatINR(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(paise / 100);
}
