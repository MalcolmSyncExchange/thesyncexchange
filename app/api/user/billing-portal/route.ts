import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { reportOperationalError, reportOperationalEvent } from "@/lib/monitoring";
import { getStripeServerClient } from "@/services/stripe/server";
import { createServerSupabaseClient } from "@/services/supabase/server";

export async function POST() {
  const authSupabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await authSupabase.auth.getUser();

  if (!user?.id || !user.email) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  reportOperationalEvent("buyer_billing_portal_requested", "Buyer requested Stripe billing portal access.", {
    userId: user.id,
    emailDomain: user.email.split("@")[1] || null
  });

  const stripe = getStripeServerClient();
  if (!stripe) {
    return NextResponse.json({ error: "Billing portal is not configured yet." }, { status: 503 });
  }

  const customers = await stripe.customers.list({
    email: user.email,
    limit: 1
  });
  const customer = customers.data[0];

  if (!customer) {
    return NextResponse.json({ error: "No Stripe billing profile exists for this account yet." }, { status: 404 });
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: `${env.appUrl}/buyer/settings`
    });

    return NextResponse.json({
      url: session.url
    });
  } catch (error) {
    reportOperationalError("buyer_billing_portal_failed", error, {
      userId: user.id
    });
    return NextResponse.json({ error: "Unable to open billing portal right now." }, { status: 500 });
  }
}
