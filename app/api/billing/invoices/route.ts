import { NextResponse } from "next/server";

import { reportOperationalError } from "@/lib/monitoring";
import { assertAuthenticatedBuyerSettingsUser, mapStripeInvoice } from "@/services/buyer/settings";
import { getStripeServerClient } from "@/services/stripe/server";
import { createServerSupabaseClient } from "@/services/supabase/server";

export async function GET() {
  const authSupabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await authSupabase.auth.getUser();
  const auth = assertAuthenticatedBuyerSettingsUser(user);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!auth.user.email) {
    return NextResponse.json({ invoices: [] });
  }

  const stripe = getStripeServerClient();
  if (!stripe) {
    return NextResponse.json({ invoices: [] });
  }

  try {
    const customers = await stripe.customers.list({
      email: auth.user.email,
      limit: 1
    });
    const customer = customers.data[0];

    if (!customer) {
      return NextResponse.json({ invoices: [] });
    }

    const invoices = await stripe.invoices.list({
      customer: customer.id,
      limit: 5
    });

    return NextResponse.json({
      invoices: invoices.data.map(mapStripeInvoice)
    });
  } catch (error) {
    reportOperationalError("buyer_invoices_load_failed", error, {
      userId: auth.user.id
    });
    return NextResponse.json({ error: "Unable to load invoices right now." }, { status: 500 });
  }
}
