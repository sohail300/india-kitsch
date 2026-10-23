import type { Metadata } from "next";
import { AuthShell } from "@/app/admin/_components/auth-shell";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "Reset password - India Kitsch Admin",
  robots: { index: false, follow: false },
};

/** Reads `searchParams` (the `?token=` Better Auth's email-link callback redirects with) - genuinely request-time, not worth a Suspense boundary for an auth page. See `(dashboard)/layout.tsx`'s `instant` comment for the full rationale. */
export const instant = false;

export default async function AdminResetPasswordPage(props: PageProps<"/admin/reset-password">) {
  const searchParams = await props.searchParams;
  const token = typeof searchParams.token === "string" ? searchParams.token : undefined;

  return (
    <AuthShell>
      <ResetPasswordForm token={token} />
    </AuthShell>
  );
}
