"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle2Icon, EyeIcon, EyeOffIcon, Loader2Icon } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const schema = z
  .object({
    newPassword: z.string().min(8, "At least 8 characters"),
    confirmPassword: z.string().min(1, "Required"),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });
type FormValues = z.infer<typeof schema>;

export function ResetPasswordForm({ token }: { token?: string }) {
  const router = useRouter();
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  async function onSubmit(values: FormValues) {
    setFormError(null);
    const { error } = await authClient.resetPassword({ newPassword: values.newPassword, token });

    if (error) {
      setFormError(error.message ?? "That reset link is invalid or has expired.");
      return;
    }

    setDone(true);
    setTimeout(() => router.push("/admin/login"), 1500);
  }

  if (!token) {
    return (
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader>
          <CardTitle className="text-xl">Invalid reset link</CardTitle>
          <CardDescription>
            This link is missing its token - request a new one to reset your password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="h-10 w-full" render={<Link href="/admin/forgot-password" />}>
            Request a new link
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (done) {
    return (
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader>
          <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <CheckCircle2Icon className="size-5" />
          </div>
          <CardTitle className="text-xl">Password updated</CardTitle>
          <CardDescription>Taking you to sign in…</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm shadow-lg">
      <CardHeader>
        <CardTitle className="text-xl">Reset password</CardTitle>
        <CardDescription>Choose a new password for your admin account.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="newPassword">New password</Label>
            <div className="relative">
              <Input
                id="newPassword"
                type={showNewPassword ? "text" : "password"}
                autoComplete="new-password"
                autoFocus
                placeholder="••••••••"
                className="h-10 pr-9"
                {...form.register("newPassword")}
              />
              <button
                type="button"
                onClick={() => setShowNewPassword((v) => !v)}
                className="absolute top-1/2 right-0.5 flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground"
                aria-label={showNewPassword ? "Hide password" : "Show password"}
              >
                {showNewPassword ? (
                  <EyeOffIcon className="size-4" />
                ) : (
                  <EyeIcon className="size-4" />
                )}
              </button>
            </div>
            {form.formState.errors.newPassword ? (
              <p className="text-xs text-destructive">
                {form.formState.errors.newPassword.message}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="••••••••"
                className="h-10 pr-9"
                {...form.register("confirmPassword")}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((v) => !v)}
                className="absolute top-1/2 right-0.5 flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground"
                aria-label={showConfirmPassword ? "Hide password" : "Show password"}
              >
                {showConfirmPassword ? (
                  <EyeOffIcon className="size-4" />
                ) : (
                  <EyeIcon className="size-4" />
                )}
              </button>
            </div>
            {form.formState.errors.confirmPassword ? (
              <p className="text-xs text-destructive">
                {form.formState.errors.confirmPassword.message}
              </p>
            ) : null}
          </div>

          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

          <Button type="submit" className="mt-1 h-10 w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? <Loader2Icon className="size-4 animate-spin" /> : null}
            Reset password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
