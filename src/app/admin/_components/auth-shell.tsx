import type { ReactNode } from "react";

/**
 * The split gradient/form shell shared by every unauthenticated admin page
 * (login, forgot-password, reset-password) - kept in one place so the
 * three stay visually consistent instead of drifting copies of the same
 * markup.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh bg-background">
      {/* Decorative on lg+ only - an auth form needs the full viewport on mobile. */}
      <div
        className="relative hidden shrink-0 flex-col justify-between overflow-hidden p-10 lg:flex lg:w-1/2"
        style={{
          background:
            "linear-gradient(135deg, oklch(0.24 0.07 40) 0%, oklch(0.4 0.15 40) 55%, oklch(0.56 0.18 38) 100%)",
        }}
      >
        <div className="flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-xl bg-white/15 text-base font-bold text-white backdrop-blur-sm">
            IK
          </div>
          <span className="text-lg font-semibold tracking-tight text-white">India Kitsch</span>
        </div>

        <div>
          <p className="text-2xl leading-snug font-semibold text-white">
            Run the store from one place.
          </p>
          <p className="mt-2 max-w-xs text-sm text-white/70">
            One place for orders, stock and everything in between.
          </p>
        </div>

        <p className="text-xs text-white/50">
          India Kitsch admin panel. Access is restricted to store staff.
        </p>
      </div>

      <div className="flex min-h-svh flex-1 flex-col items-center justify-center px-4 py-12">
        <div className="mb-8 flex items-center gap-2 lg:hidden">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-base font-bold text-primary-foreground">
            IK
          </div>
          <span className="text-lg font-semibold tracking-tight text-foreground">
            India Kitsch <span className="font-normal text-muted-foreground">Admin</span>
          </span>
        </div>

        {children}
      </div>
    </div>
  );
}
