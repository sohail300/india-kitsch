"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeftIcon, Loader2Icon, MailCheckIcon } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TurnstileWidget } from "@/app/admin/login/turnstile-widget";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

const schema = z.object({ email: z.email("Enter a valid email") });
type FormValues = z.infer<typeof schema>;

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: FormValues) {
    setFormError(null);

    if (TURNSTILE_SITE_KEY && !captchaToken) {
      setFormError("Please complete the verification check.");
      return;
    }

    const { error } = await authClient.requestPasswordReset({
      email: values.email,
      redirectTo: "/admin/reset-password",
      fetchOptions: captchaToken ? { headers: { "x-captcha-response": captchaToken } } : undefined,
    });

    // Same message either way - Better Auth's own server-side callback
    // deliberately doesn't await the send for this exact reason (see
    // server/auth/config.ts): whether the email matched an account must
    // never be observable from the response.
    if (error) {
      setCaptchaToken(null);
      setCaptchaKey((k) => k + 1);
    }
    setSent(true);
  }

  if (sent) {
    return (
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader>
          <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <MailCheckIcon className="size-5" />
          </div>
          <CardTitle className="text-xl">Check your email</CardTitle>
          <CardDescription>
            If that email has an admin account, we&apos;ve sent a link to reset the password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/admin/login"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeftIcon className="size-3.5" />
            Back to sign in
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm shadow-lg">
      <CardHeader>
        <CardTitle className="text-xl">Forgot password</CardTitle>
        <CardDescription>
          Enter your admin email and we&apos;ll send you a reset link.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="you@indiakitsch.com"
              className="h-10"
              {...form.register("email")}
            />
            {form.formState.errors.email ? (
              <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
            ) : null}
          </div>

          {TURNSTILE_SITE_KEY ? (
            <TurnstileWidget
              key={captchaKey}
              siteKey={TURNSTILE_SITE_KEY}
              onVerify={setCaptchaToken}
            />
          ) : null}

          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

          <Button type="submit" className="mt-1 h-10 w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? <Loader2Icon className="size-4 animate-spin" /> : null}
            Send reset link
          </Button>

          <Link
            href="/admin/login"
            className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeftIcon className="size-3.5" />
            Back to sign in
          </Link>
        </form>
      </CardContent>
    </Card>
  );
}
