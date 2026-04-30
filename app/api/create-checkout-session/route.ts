import { NextResponse } from "next/server";

import { env, getDeploymentTarget } from "@/lib/env";
import { assertStripeServerConfiguration } from "@/lib/server-env";
import { getStripeServerClient } from "@/services/stripe/server";

export async function POST() {
  if (getDeploymentTarget() === "production") {
    return NextResponse.json({ error: "This test-only checkout route is unavailable in production." }, { status: 404 });
  }

  try {
    assertStripeServerConfiguration("Stripe test checkout");
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Stripe is not configured for this environment."
      },
      { status: 503 }
    );
  }

  const stripe = getStripeServerClient();

  if (!stripe) {
    return NextResponse.json({ error: "Stripe is not configured for this environment." }, { status: 500 });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: 2500,
            product_data: {
              name: "Test License"
            }
          }
        }
      ],
      success_url: `${env.appUrl}/success`,
      cancel_url: `${env.appUrl}/cancel`
    });

    if (!session.url) {
      return NextResponse.json({ error: "Stripe did not return a checkout URL." }, { status: 500 });
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to create Stripe Checkout session."
      },
      { status: 500 }
    );
  }
}
