import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { reportOperationalError, reportOperationalEvent } from "@/lib/monitoring";
import { assertAuthenticatedBuyerSettingsUser, buildBillingPortalReturnUrl } from "@/services/buyer/settings";
import { getStripeServerClient } from "@/services/stripe/server";
import { createServerSupabaseClient } from "@/services/supabase/server";

export async function POST() {
  const authSupabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await authSupabase.auth.getUser();
  const auth = assertAuthenticatedBuyerSettingsUser(user);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!auth.user.email) {
    return NextResponse.json({ error: "Add an account email before opening billing." }, { status: 400 });
  }

  reportOperationalEvent("buyer_billing_portal_requested", "Buyer requested Stripe billing portal access.", {
    userId: auth.user.id,
    emailDomain: auth.user.email.split("@")[1] || null
  });

  const stripe = getStripeServerClient();
  if (!stripe) {
    return NextResponse.json({ error: "Billing portal is not configured yet." }, { status: 503 });
  }

  try {
    const existingCustomers = await stripe.customers.list({
      email: auth.user.email,
      limit: 1
    });
    const customer =
      existingCustomers.data[0] ||
      (await stripe.customers.create({
        email: auth.user.email,
        metadata: {
          supabaseUserId: auth.user.id,
          source: "buyer_settings"
        }
      }));

    const session = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: buildBillingPortalReturnUrl(env.appUrl)
    });

    return NextResponse.json({
      url: session.url
    });
  } catch (error) {
    reportOperationalError("buyer_billing_portal_failed", error, {
      userId: auth.user.id
    });
    return NextResponse.json({ error: "Unable to open billing portal right now." }, { status: 500 });
  }
}
