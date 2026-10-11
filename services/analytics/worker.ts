import "server-only";
import { attemptDelivery } from "./server";

/** Server entrypoint for a future scheduler. No schedule or public route is installed. */
export async function runAnalyticsDeliveryBatch(limit = 10): Promise<{ attempted: number; accepted: number }> {
  const bound = Math.min(10, Math.max(0, Math.trunc(limit)));
  let attempted = 0;
  let accepted = 0;
  for (; attempted < bound;) {
    const outcome = await attemptDelivery();
    if (outcome === "empty") break;
    if (outcome === "unavailable") throw new Error("analytics_delivery_unavailable");
    attempted++;
    if (outcome === "accepted") accepted++;
  }
  return { attempted, accepted };
}
