import { env } from "@/server/lib/env";
import { logger } from "@/server/lib/logger";
import { reconcileExpiredOrders } from "@/server/modules/payments/reconcile";

/**
 * Called every 10 minutes by the Cloudflare cron Worker (docs/08 §18) with
 * `Authorization: Bearer CRON_SECRET` — lost-webhook recovery and
 * late-payment detection (docs/06 §9 step 7). Idempotent: every order it
 * touches goes through the same guarded transition/reservation functions
 * checkout and the webhook use, so running it twice in a row is harmless.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await reconcileExpiredOrders();

  if (result.alerts.length > 0) {
    logger.warn("cron/reconcile: run completed with items needing attention", { ...result });
  } else {
    logger.info("cron/reconcile: run completed", { ...result });
  }

  return Response.json(result);
}
