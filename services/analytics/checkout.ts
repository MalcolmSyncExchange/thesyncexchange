import "server-only";
import type Stripe from "stripe";
import { assertStripeRuntimeObject } from "@/lib/server-env";
import { filterProperties } from "@/lib/analytics/schema";
import { captureForUser } from "./actor";

// Call only after the marketplace order has persisted the new session binding.
// URL and Stripe objects are validation inputs, never event properties.
export async function captureCheckoutStarted(userId: string, orderId: string, trackId: string, license: unknown, session: Stripe.Checkout.Session) {
  try {
    assertStripeRuntimeObject("Analytics checkout", { livemode: session.livemode, checkoutSessionId: session.id });
    if (!session.id || !session.url || session.client_reference_id !== orderId) return;
    const url = new URL(session.url);
    if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com" || url.username || url.password || url.port) return;
    const safe = filterProperties("checkout_started", {
      order_id: orderId, track_id: trackId, license_type: license, checkout_attempt_id: crypto.randomUUID()
    });
    if (safe) await captureForUser(userId, "checkout_started", safe);
  } catch { /* Analytics cannot interrupt checkout redirects. */ }
}
