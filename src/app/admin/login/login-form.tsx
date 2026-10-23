"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { EyeIcon, EyeOffIcon, Loader2Icon } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TurnstileWidget } from "./turnstile-widget";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

const credentialsSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});
type CredentialsInput = z.infer<typeof credentialsSchema>;

export function LoginForm({ forbidden }: { forbidden: boolean }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(
    forbidden ? "That account doesn't have admin access." : null,
  );
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  // Bumped on a failed sign-in to force the widget to remount and issue a
  // fresh token - a Turnstile token is single-use, so re-submitting the
  // same one (e.g. after a wrong-password error) would fail again.
  const [captchaKey, setCaptchaKey] = useState(0);

  const credentialsForm = useForm<CredentialsInput>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onCredentialsSubmit(values: CredentialsInput) {
    setFormError(null);

    if (TURNSTILE_SITE_KEY && !captchaToken) {
      setFormError("Please complete the verification check.");
      return;
    }

    const { error } = await authClient.signIn.email({
      email: values.email,
      password: values.password,
      fetchOptions: captchaToken ? { headers: { "x-captcha-response": captchaToken } } : undefined,
    });

    if (error) {
      setFormError(error.message ?? "Invalid email or password");
      setCaptchaToken(null);
      setCaptchaKey((k) => k + 1);
      return;
    }

    router.push("/admin");
    router.refresh();
  }

  return (
    <Card className="w-full max-w-sm shadow-lg">
      <CardHeader>
        <CardTitle className="text-xl">Sign in</CardTitle>
        <CardDescription>Enter your admin email and password.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={credentialsForm.handleSubmit(onCredentialsSubmit)}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="you@indiakitsch.com"
              className="h-10"
              {...credentialsForm.register("email")}
            />
            {credentialsForm.formState.errors.email ? (
              <p className="text-xs text-destructive">
                {credentialsForm.formState.errors.email.message}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••"
                className="h-10 pr-9"
                {...credentialsForm.register("password")}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute top-1/2 right-0.5 flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
              </button>
            </div>
            {credentialsForm.formState.errors.password ? (
              <p className="text-xs text-destructive">
                {credentialsForm.formState.errors.password.message}
              </p>
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

          <Link
            href="/admin/forgot-password"
            className="-mb-1 self-end text-xs text-muted-foreground hover:text-foreground"
          >
            Forgot password?
          </Link>

          <Button
            type="submit"
            className="h-10 w-full"
            disabled={credentialsForm.formState.isSubmitting}
          >
            {credentialsForm.formState.isSubmitting ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : null}
            Sign in
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
