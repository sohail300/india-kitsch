import { ZodError } from "zod";
import { requireAdmin } from "@/server/auth/session";
import { commitProductImageUpload } from "@/server/modules/media/uploads";

/** docs/07 §12 step 4 - `requireAdmin()`, then server-side verification (size, content-type, magic bytes) before the `product_images` row is created. */
export async function POST(request: Request) {
  try {
    const session = await requireAdmin(request.headers);
    const body = await request.json();
    const result = await commitProductImageUpload(body, session.user.id);
    return Response.json(result, { status: result.ok ? 200 : 422 });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: "Invalid input", details: error.flatten() }, { status: 400 });
    }
    if (error instanceof Error && "status" in error && typeof error.status === "number") {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
