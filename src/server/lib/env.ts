import "server-only";
import { z } from "zod";

/**
 * All environment variables the Next.js app reads at runtime, validated
 * once at import time so misconfiguration fails fast instead of surfacing
 * as a confusing error deep inside checkout or a webhook handler.
 *
 * `DATABASE_URL_SESSION`, `SUPABASE_URL`/`SUPABASE_ANON_KEY`, and the
 * backup-related `B2_*`/`BACKUP_AGE_PUBLIC_KEY`/`SENTRY_AUTH_TOKEN` vars
 * are deliberately NOT here — they belong to CI or the Cloudflare cron
 * Worker, never to this app. See docs/08-infrastructure-backups-ops.md §19.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Database — Supabase, transaction pooler (prepare: false; see docs/03 §11, docs/01 §2)
  DATABASE_URL: z.url(),

  // Auth (Better Auth)
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),

  // Payments (Razorpay)
  RAZORPAY_KEY_SECRET: z.string().min(1),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1),
  NEXT_PUBLIC_RAZORPAY_KEY_ID: z.string().min(1),

  // Site / public config
  NEXT_PUBLIC_SITE_URL: z.url(),
  NEXT_PUBLIC_IMAGE_BASE_URL: z.url(),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1),
  TURNSTILE_SECRET: z.string().min(1),

  // Email (Resend)
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.email(),
  CONTACT_INBOX_EMAIL: z.email(),

  // Files (Cloudflare R2)
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),

  // Cron (shared secret with the Cloudflare cron Worker)
  CRON_SECRET: z.string().min(16),

  // Monitoring — optional until Sentry is wired up in Phase 7
  SENTRY_DSN: z.url().optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const fieldErrors = z.flattenError(parsed.error).fieldErrors;
    console.error("Invalid environment variables:", fieldErrors);
    throw new Error(
      "Invalid environment variables — see the list above, and check .env.local against .env.example.",
    );
  }

  return parsed.data;
}

export const env = loadEnv();
