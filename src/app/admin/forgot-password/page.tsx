import type { Metadata } from "next";
import { AuthShell } from "@/app/admin/_components/auth-shell";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = {
  title: "Forgot password - India Kitsch Admin",
  robots: { index: false, follow: false },
};

export default function AdminForgotPasswordPage() {
  return (
    <AuthShell>
      <ForgotPasswordForm />
    </AuthShell>
  );
}
