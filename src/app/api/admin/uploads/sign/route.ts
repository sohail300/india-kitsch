import { ZodError } from "zod";
import { requireAdmin } from "@/server/auth/session";
import { NotFoundError } from "@/server/lib/errors";
import { signProductImageUpload } from "@/server/modules/media/uploads";

/** docs/07 §12 step 2 — `requireAdmin()`, then a presigned PUT URL for the browser to upload directly to R2. */
export async function POST(request: Request) {
  try {
    await requireAdmin(request.headers);
    const body = await request.json();
    const result = await signProductImageUpload(body);
    return Response.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: "Invalid input", details: error.flatten() }, { status: 400 });
    }
    if (error instanceof NotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof Error && "status" in error && typeof error.status === "number") {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
