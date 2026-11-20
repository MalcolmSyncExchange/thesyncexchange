import "server-only";
import Stripe from "stripe";
import { isAuthSessionMissingError } from "@supabase/supabase-js";
import { selectBuyerCustomer } from "@/lib/billing-customer";
import { unstable_rethrow } from "next/navigation";

import { env, hasSupabaseEnv } from "@/lib/env";
import { createServerSupabaseClient } from "@/services/supabase/server";
import { getStripeServerClient } from "@/services/stripe/server";
import { mapStripeInvoice } from "@/services/buyer/settings";
import { reportOperationalEvent } from "@/lib/monitoring";

export type BuyerInvoiceHistory = { status: "available" | "unavailable"; invoices: ReturnType<typeof mapStripeInvoice>[] };
const available = (invoices: BuyerInvoiceHistory["invoices"] = []): BuyerInvoiceHistory => ({ status: "available", invoices });
const unavailable = (): BuyerInvoiceHistory => {
  reportOperationalEvent("buyer_invoice_history_unavailable", "Invoice history unavailable; other settings remain available.");
  return { status: "unavailable", invoices: [] };
};
export async function loadBuyerInvoices(): Promise<BuyerInvoiceHistory> {
  // Demo identity never selects customers in a configured Stripe account.
  if (env.demoMode) return available();
  if (!hasSupabaseEnv) return unavailable();

  try {
    const client = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError) {
      if (isAuthSessionMissingError(authError)) return available();
      throw new Error("Unable to verify billing session.");
    }
    if (!user?.id || !user.email) return available();
    const { data: profile, error: roleError } = await client
      .from("user_profiles").select("role").eq("id", user.id).maybeSingle();
    if (roleError) throw new Error("Unable to verify billing account role.");
    if (profile?.role !== "buyer") return available();
    const active = await client.rpc("auth_session_is_active");
    if (active.error) throw new Error("Unable to verify active billing session.");
    if (active.data !== true) throw new Error("Active billing session required.");

    const stripe = getStripeServerClient();
    if (!stripe) return unavailable();
    const customers = await stripe.customers.list({ email: user.email, limit: 100 }, { timeout: 5000, maxNetworkRetries: 0 });
    const customer = selectBuyerCustomer(customers, user.id);
    if (!customer) return available();
    const invoices = await stripe.invoices.list({ customer: customer.id, limit: 5 }, { timeout: 5000, maxNetworkRetries: 0 });
    return available(invoices.data.map(mapStripeInvoice));
  } catch (error) {
    unstable_rethrow(error);
    if ([Stripe.errors.StripeConnectionError, Stripe.errors.StripeAPIError, Stripe.errors.StripeAuthenticationError, Stripe.errors.StripePermissionError, Stripe.errors.StripeRateLimitError].some(Type => error instanceof Type)) return unavailable();
    // Unexpected auth, database, ownership and mapping failures remain failures.
    reportOperationalEvent("buyer_invoice_history_access_failed", "Billing account verification or evidence requires review.");
    throw new Error("Unable to verify billing history. Account access or billing evidence requires review.");
  }
}
