import type { Metadata } from "next";
import { AuthShell } from "@/app/admin/_components/auth-shell";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in - India Kitsch Admin",
  robots: { index: false, follow: false },
};

/** Reads `searchParams` (the `?error=forbidden` flag) - genuinely request-time, not worth a Suspense boundary for a login page. See `(dashboard)/layout.tsx`'s `instant` comment for the full rationale. */
export const instant = false;

export default async function AdminLoginPage(props: PageProps<"/admin/login">) {
  const searchParams = await props.searchParams;
  const forbidden = searchParams.error === "forbidden";

  return (
    <AuthShell>
      <LoginForm forbidden={forbidden} />
    </AuthShell>
  );
}
