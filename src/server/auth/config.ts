import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { captcha, twoFactor } from "better-auth/plugins";
import type { db as AppDb } from "@/server/db/client";
import { emailSender } from "@/server/lib/email";
import {
  resetPasswordTemplate,
  verifyEmailTemplate,
} from "@/server/modules/notifications/templates/auth";

/**
 * No `import "server-only"` here deliberately, same reasoning as the
 * schema files (schema/_shared.ts) and db/client.ts's split for
 * seed.ts: this needs to be constructible by both the real app
 * (server/auth/auth.ts, which does carry the guard) and
 * scripts/create-admin.ts, which builds its own lightweight connection
 * the same way scripts/backup-db.ts and db/seed.ts do.
 *
 * No admin plugin: it brings a multi-role/ban/impersonation model we
 * don't want. Our role model is a plain two-value `customer`/`admin`
 * field (docs/03 §4), and `requireAdmin()` (session.ts) reads that
 * directly — authorization lives in our own DAL, not in a Better Auth
 * plugin's permission system (docs/04 §5).
 */
// `satisfies`, not `: BetterAuthOptions` — the latter would widen and
// erase the literal shape of `user.additionalFields` (role/phone/
// disabled), and betterAuth()'s generic inference needs that literal
// type to include them on Session["user"] (see session.ts). `satisfies`
// checks against BetterAuthOptions without doing that widening, and
// still gives the callbacks below their contextual parameter types.
export function createAuthConfig(db: typeof AppDb, env: AuthConfigEnv) {
  return {
    appName: "India Kitsch",
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,

    database: drizzleAdapter(db, {
      provider: "pg",
      schemaName: "app",
    }),

    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      // Verification is required before checkout (our own check in the
      // checkout module, docs/06 §9), not before login — so this stays
      // false.
      requireEmailVerification: false,
      // Per Better Auth's own guidance: never `await` sending the email —
      // doing so would let response timing reveal whether an address is
      // registered.
      sendResetPassword: async ({ user, url }) => {
        const email = resetPasswordTemplate(user.name, url);
        void emailSender.send({ to: user.email, ...email });
      },
    },

    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        const email = verifyEmailTemplate(user.name, url);
        void emailSender.send({ to: user.email, ...email });
      },
    },

    // Only registered once real Google credentials exist — the `account`
    // table's shape doesn't depend on which providers are active.
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          socialProviders: {
            google: {
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
            },
          },
        }
      : {}),

    user: {
      additionalFields: {
        // Never client-settable (`input: false`) — prevents privilege
        // escalation via the signup form. Promoted only by
        // scripts/create-admin.ts or a direct DB update. See docs/03 §4,
        // docs/04 §5.
        role: {
          type: "string",
          input: false,
          defaultValue: "customer",
        },
        phone: {
          type: "string",
          required: false,
          input: true,
        },
        disabled: {
          type: "boolean",
          input: false,
          defaultValue: false,
        },
      },
    },

    // Vercel functions don't persist in-memory state across invocations
    // (docs/01 §0), so "database" storage is the only option that
    // actually works here, not the (memory) default.
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      storage: "database",
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 3 },
        "/request-password-reset": { window: 60, max: 3 },
        "/two-factor/*": { window: 60, max: 5 },
      },
    },

    plugins: [
      // TOTP 2FA for admin accounts (docs/04 §5). Enrollment/enforcement
      // flow is separate application logic; this gets the `twoFactor`
      // table and `user.twoFactorEnabled` field, plus the actual
      // verify/challenge endpoints.
      twoFactor(),
      // Cloudflare Turnstile on sign-up/sign-in/reset (docs/04 §5, §14).
      // Only active once a real (or, locally, Cloudflare's official
      // always-pass test) secret is configured — see docs/29 #16-style
      // "optional until built" pattern in env.ts. If this is ever
      // missing in production, those endpoints run with **no** captcha
      // protection — see docs/11 §27 for why that's flagged as a
      // pre-launch check, not silently acceptable.
      ...(env.TURNSTILE_SECRET
        ? [captcha({ provider: "cloudflare-turnstile", secretKey: env.TURNSTILE_SECRET })]
        : []),
    ],
  } satisfies BetterAuthOptions;
}

/** The subset of `env.ts` this config actually needs — kept narrow so a
 * script building its own config doesn't need the app's full env shape. */
export interface AuthConfigEnv {
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  TURNSTILE_SECRET?: string;
}

export function buildAuth(db: typeof AppDb, env: AuthConfigEnv) {
  return betterAuth(createAuthConfig(db, env));
}
