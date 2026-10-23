import { ZodError } from "zod";
import { AppError } from "@/server/lib/errors";

/**
 * The shape every admin Server Action resolves to - never throws across
 * the server/client boundary. Actions call `requireAdmin()` (thrown errors
 * caught here), the underlying `server/modules/**\/admin.ts` mutation
 * (typed `AppError`s or a Zod parse failure caught here), and, on success,
 * `revalidateTag`/`revalidatePath` before returning `{ ok: true }`.
 */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

export function actionError(error: unknown): { ok: false; error: string } {
  if (error instanceof ZodError) {
    const first = error.issues[0];
    return { ok: false, error: first ? first.message : "Invalid input" };
  }
  if (error instanceof AppError) {
    return { ok: false, error: error.message };
  }
  if (error && typeof error === "object" && "status" in error && "message" in error) {
    // UnauthorizedError / ForbiddenError from server/auth/session.ts
    return { ok: false, error: String((error as { message: unknown }).message) };
  }
  if (error instanceof Error) {
    return { ok: false, error: error.message };
  }
  return { ok: false, error: "Something went wrong" };
}
