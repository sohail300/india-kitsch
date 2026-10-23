import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ForbiddenError, UnauthorizedError, requireAdmin } from "@/server/auth/session";

/**
 * Page-level guard for every route under `admin/(dashboard)` (docs/07 §13:
 * "requireAdmin() in every page/action/handler"). A signed-out visitor goes
 * to the login page; a signed-in non-admin (e.g. a customer account) goes
 * there too, with a message, rather than a raw 403 - there's no separate
 * "you're logged in but not allowed" page to build for two admin accounts
 * (docs/11 §29 #5).
 */
export async function getAdminSession() {
  try {
    return await requireAdmin(await headers());
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/admin/login");
    if (error instanceof ForbiddenError) redirect("/admin/login?error=forbidden");
    throw error;
  }
}
