import "server-only";

import { env, hasSupabaseEnv } from "@/lib/env";
import { createServerSupabaseClient } from "@/services/supabase/server";
import { getStripeServerClient } from "@/services/stripe/server";
import { mapStripeInvoice } from "@/services/buyer/settings";

export async function loadBuyerInvoices() {
  // Demo identity never selects customers in a configured Stripe account.
  if (env.demoMode || !hasSupabaseEnv) return [];

  const client = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user?.id || !user.email) return [];
  const { data: profile, error: roleError } = await client
    .from("user_profiles").select("role").eq("id", user.id).maybeSingle();
  if (roleError || profile?.role !== "buyer") return [];

  const stripe = getStripeServerClient();
  if (!stripe) return [];
  const customers = await stripe.customers.list({ email: user.email, limit: 1 }).catch(() => ({ data: [] }));
  const customer = customers.data[0];
  if (!customer) return [];
  const invoices = await stripe.invoices.list({ customer: customer.id, limit: 5 }).catch(() => ({ data: [] }));
  return invoices.data.map(mapStripeInvoice);
}
