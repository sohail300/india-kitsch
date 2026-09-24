/**
 * Real integration test — Phase 9 authz audit (docs/10 roadmap). Every
 * other integration test calls a module's service function directly, which
 * bypasses the `requireAdmin()`/Bearer-secret check that only actually runs
 * inside the Route Handler itself. This file is the one place that invokes
 * the real exported `POST` functions from `src/app/api/**\/route.ts` with
 * constructed `Request` objects, to prove the HTTP-layer authorization
 * genuinely rejects the wrong caller — not just that the DAL functions it
 * calls would, in isolation (already proven by `session.test.ts`).
 *
 * Runs against the real Supabase project, not local Postgres, the same
 * exception `session.test.ts` documents: Better Auth's adapter (`auth.ts`)
 * and these routes' own service calls (`signProductImageUpload`,
 * `commitProductImageUpload` with no `dbHandle` override) are wired to the
 * app's single real `db` singleton, not to an injectable test handle.
 *
 * The admin-authenticated upload cases deliberately send a body that fails
 * Zod validation (e.g. `{}`), not a fully valid one — that's enough to prove
 * `requireAdmin()` let the request through to the real handler logic, without
 * writing to the real Supabase DB or the real R2 bucket (already covered,
 * with valid fixtures, by `media-uploads.test.ts`).
 *
 * The cron route's happy path (correct bearer secret) is deliberately NOT
 * exercised here: `reconcileExpiredOrders()` is called by the route with no
 * DI override, so a real run would act on real orders in the real Supabase
 * DB and could issue real Razorpay refund calls. That path's business logic
 * is already covered against local Postgres with mocked Razorpay in
 * `payments.test.ts`; this file only proves the secret check itself (401 on
 * missing/wrong bearer).
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as commitUpload } from "@/app/api/admin/uploads/commit/route";
import { POST as signUpload } from "@/app/api/admin/uploads/sign/route";
import { POST as cronReconcile } from "@/app/api/cron/reconcile/route";
import { auth } from "@/server/auth/auth";
import { db } from "@/server/db/client";
import { user as userTable } from "@/server/db/schema";
import { env } from "@/server/lib/env";
import { createId } from "@/server/lib/ids";

const suffix = createId().slice(-8).toLowerCase();
const CUSTOMER_EMAIL = `authz-customer-${suffix}@indiakitsch.test`;
const ADMIN_EMAIL = `authz-admin-${suffix}@indiakitsch.test`;
const PASSWORD = "IntegrationTest123";

async function signUpAndGetCookie(email: string, name: string): Promise<string> {
  await auth.api.signUpEmail({ body: { email, password: PASSWORD, name } });
  const result = await auth.api.signInEmail({
    body: { email, password: PASSWORD },
    returnHeaders: true,
  });
  const setCookie = result.headers.get("set-cookie");
  if (!setCookie) throw new Error(`No set-cookie header returned signing in ${email}`);
  return setCookie.split(";")[0]!;
}

let customerCookie: string;
let adminCookie: string;

function request(url: string, cookie?: string, body: unknown = {}): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  customerCookie = await signUpAndGetCookie(CUSTOMER_EMAIL, "Authz Test Customer");
  adminCookie = await signUpAndGetCookie(ADMIN_EMAIL, "Authz Test Admin");
  await db.update(userTable).set({ role: "admin" }).where(eq(userTable.email, ADMIN_EMAIL));
}, 30_000);

afterAll(async () => {
  for (const email of [CUSTOMER_EMAIL, ADMIN_EMAIL]) {
    await db.delete(userTable).where(eq(userTable.email, email));
  }
});

describe("POST /api/admin/uploads/sign", () => {
  it("rejects with 401 when there's no session at all", async () => {
    const res = await signUpload(request("http://localhost/api/admin/uploads/sign"));
    expect(res.status).toBe(401);
  });

  it("rejects with 403 for a signed-in, non-admin customer", async () => {
    const res = await signUpload(
      request("http://localhost/api/admin/uploads/sign", customerCookie),
    );
    expect(res.status).toBe(403);
  });

  it("lets an admin session through to the real handler (400 on the invalid body, not 401/403)", async () => {
    const res = await signUpload(
      request("http://localhost/api/admin/uploads/sign", adminCookie, {}),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid input");
  });
});

describe("POST /api/admin/uploads/commit", () => {
  it("rejects with 401 when there's no session at all", async () => {
    const res = await commitUpload(request("http://localhost/api/admin/uploads/commit"));
    expect(res.status).toBe(401);
  });

  it("rejects with 403 for a signed-in, non-admin customer", async () => {
    const res = await commitUpload(
      request("http://localhost/api/admin/uploads/commit", customerCookie),
    );
    expect(res.status).toBe(403);
  });

  it("lets an admin session through to the real handler (400 on the invalid body, not 401/403)", async () => {
    const res = await commitUpload(
      request("http://localhost/api/admin/uploads/commit", adminCookie, {}),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid input");
  });
});

describe("POST /api/cron/reconcile", () => {
  it("rejects with 401 when there's no Authorization header", async () => {
    const res = await cronReconcile(
      new Request("http://localhost/api/cron/reconcile", { method: "POST" }),
    );
    expect(res.status).toBe(401);
  });

  it("rejects with 401 for a wrong bearer secret", async () => {
    const res = await cronReconcile(
      new Request("http://localhost/api/cron/reconcile", {
        method: "POST",
        headers: { authorization: "Bearer not-the-real-secret" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("rejects with 401 for the right secret in the wrong scheme", async () => {
    const res = await cronReconcile(
      new Request("http://localhost/api/cron/reconcile", {
        method: "POST",
        headers: { authorization: env.CRON_SECRET },
      }),
    );
    expect(res.status).toBe(401);
  });
});
