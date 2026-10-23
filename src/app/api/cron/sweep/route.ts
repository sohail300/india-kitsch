import { env } from "@/server/lib/env";
import { logger } from "@/server/lib/logger";
import { runSweep } from "@/server/modules/media/sweep";

/**
 * Called weekly by the Cloudflare cron Worker (docs/08 §18), same
 * bearer-secret auth as `/api/cron/reconcile`: deletes orphaned R2 image
 * objects (docs/07 §12 step 5) and prunes `webhook_events` rows older than
 * 90 days (docs/03 §4). Idempotent — safe to call more or less often than
 * weekly, or twice in a row.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runSweep();

  if (result.orphanImages.failed > 0) {
    logger.warn("cron/sweep: run completed with failures", { ...result });
  } else {
    logger.info("cron/sweep: run completed", { ...result });
  }

  return Response.json(result);
}
