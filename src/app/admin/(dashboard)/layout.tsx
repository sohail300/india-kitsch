import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getAdminSession } from "@/app/admin/_lib/admin-session";
import { AdminShell } from "@/app/admin/_components/admin-shell";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Every admin page reads the session and hits the DB live with no cache
 * lifetime (docs/07 §13: "Admin pages are never cached") - genuinely
 * request-dependent, not something to restructure into `<Suspense>` +
 * `use cache: private` right now. `instant = false` is Next's own
 * sanctioned migration path for exactly this (see
 * node_modules/next/dist/docs/01-app/02-guides/authentication-with-cache-components.md
 * → "Migrating an existing app"): it opts this whole subtree out of the
 * Cache Components static-shell requirement instead of failing the build.
 */
export const instant = false;

export default async function AdminDashboardLayout({ children }: { children: ReactNode }) {
  const session = await getAdminSession();

  return (
    <AdminShell adminName={session.user.name} adminEmail={session.user.email}>
      {children}
    </AdminShell>
  );
}
