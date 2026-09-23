/**
 * Real integration test — runs against the actual Supabase project (no
 * local Postgres yet), the same rigor as every other backend piece this
 * project has been verified with. Creates real users via Better Auth's
 * real signup/sign-in flow (not hand-inserted rows), gets real signed
 * session cookies, and exercises the actual DAL (docs/04 §5) that every
 * protected route/action will call.
 *
 * `server-only` (on auth.ts, db/client.ts, session.ts) resolves fine
 * here — vitest.config.ts aliases it to a no-op stub for tests.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth } from "@/server/auth/auth";
import {
  ForbiddenError,
  requireAdmin,
  requireUser,
  UnauthorizedError,
} from "@/server/auth/session";
import { db } from "@/server/db/client";
import { user as userTable } from "@/server/db/schema";
import { createId } from "@/server/lib/ids";

const suffix = createId().slice(-8).toLowerCase();
const CUSTOMER_EMAIL = `test-customer-${suffix}@indiakitsch.test`;
const ADMIN_EMAIL = `test-admin-${suffix}@indiakitsch.test`;
const DISABLED_EMAIL = `test-disabled-${suffix}@indiakitsch.test`;
const PASSWORD = "IntegrationTest123";

async function signUpAndGetHeaders(email: string, name: string): Promise<Headers> {
  await auth.api.signUpEmail({ body: { email, password: PASSWORD, name } });
  const result = await auth.api.signInEmail({
    body: { email, password: PASSWORD },
    returnHeaders: true,
  });
  const setCookie = result.headers.get("set-cookie");
  if (!setCookie) throw new Error(`No set-cookie header returned signing in ${email}`);
  return new Headers({ cookie: setCookie.split(";")[0] });
}

let customerHeaders: Headers;
let adminHeaders: Headers;
let disabledHeaders: Headers;

beforeAll(async () => {
  customerHeaders = await signUpAndGetHeaders(CUSTOMER_EMAIL, "Test Customer");

  adminHeaders = await signUpAndGetHeaders(ADMIN_EMAIL, "Test Admin");
  await db.update(userTable).set({ role: "admin" }).where(eq(userTable.email, ADMIN_EMAIL));

  disabledHeaders = await signUpAndGetHeaders(DISABLED_EMAIL, "Test Disabled");
  await db.update(userTable).set({ disabled: true }).where(eq(userTable.email, DISABLED_EMAIL));
}, 30_000);

afterAll(async () => {
  for (const email of [CUSTOMER_EMAIL, ADMIN_EMAIL, DISABLED_EMAIL]) {
    await db.delete(userTable).where(eq(userTable.email, email));
  }
});

describe("requireUser", () => {
  it("throws UnauthorizedError with no session cookie", async () => {
    await expect(requireUser(new Headers())).rejects.toThrow(UnauthorizedError);
  });

  it("throws UnauthorizedError with a garbage cookie", async () => {
    await expect(
      requireUser(new Headers({ cookie: "better-auth.session_token=not-a-real-token" })),
    ).rejects.toThrow(UnauthorizedError);
  });

  it("returns the session for a valid, non-disabled user", async () => {
    const session = await requireUser(customerHeaders);
    expect(session.user.email).toBe(CUSTOMER_EMAIL);
    expect(session.user.role).toBe("customer"); // the default — never client-settable
  });

  it("throws UnauthorizedError for a disabled account, even with a valid session cookie", async () => {
    // Proves disabled-ness is checked live against the DB on every call,
    // not just baked into the session at sign-in time.
    await expect(requireUser(disabledHeaders)).rejects.toThrow(UnauthorizedError);
  });
});

describe("requireAdmin", () => {
  it("throws UnauthorizedError with no session at all (not ForbiddenError)", async () => {
    await expect(requireAdmin(new Headers())).rejects.toThrow(UnauthorizedError);
  });

  it("throws ForbiddenError for a signed-in customer — the IDOR/privilege-escalation guard", async () => {
    await expect(requireAdmin(customerHeaders)).rejects.toThrow(ForbiddenError);
  });

  it("returns the session for an admin", async () => {
    const session = await requireAdmin(adminHeaders);
    expect(session.user.role).toBe("admin");
  });
});

describe("session isolation", () => {
  it("customer and admin sessions resolve to distinct user ids", async () => {
    const customerSession = await requireUser(customerHeaders);
    const adminSession = await requireUser(adminHeaders);
    expect(customerSession.user.id).not.toBe(adminSession.user.id);
  });
});
