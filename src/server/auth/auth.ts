import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { twoFactor } from "better-auth/plugins";
import { db } from "@/server/db/client";
import { env } from "@/server/lib/env";

/**
 * Phase 1 scope: just enough config to generate the right schema (the
 * user/session/account/verification/twoFactor tables in the `app` schema,
 * plus our role/phone/disabled fields on `user`) and to have a real,
 * working DAL to build on. Full behavioral wiring — rate limits,
 * Turnstile, Google OAuth actually tested end-to-end, verification/reset
 * email sending — is Phase 3 (auth backend) work, not this file's job yet.
 *
 * No admin plugin: it brings a multi-role/ban/impersonation model we
 * don't want. Our role model is a plain two-value `customer`/`admin`
 * field (docs/03 §4), and `requireAdmin()` (session.ts, added when Phase 3
 * builds it) reads that directly — authorization lives in our own DAL,
 * not in a Better Auth plugin's permission system (docs/04 §5).
 */
export const auth = betterAuth({
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
    // false. Better Auth still sends a verification email on signup once
    // Phase 8 wires up a real `sendVerificationEmail`.
    requireEmailVerification: false,
  },

  // Only registered once real credentials exist (Phase 3) — the `account`
  // table's shape doesn't depend on which providers are active, so schema
  // generation works identically either way.
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

  // TOTP 2FA for admin accounts (docs/04 §5). Enrollment/enforcement flow
  // is Phase 3 work; this just gets the `twoFactor` table and
  // `user.twoFactorEnabled` field into the schema now.
  plugins: [twoFactor()],
});
