import { NextResponse } from "next/server";

import { reportOperationalError, reportOperationalEvent } from "@/lib/monitoring";
import { buildBuyerProfileUpdate, validateBuyerSettings } from "@/services/buyer/settings";
import { createServerSupabaseClient } from "@/services/supabase/server";

export async function PATCH(request: Request) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { companyName?: string; billingEmail?: string } | null;
  const validation = validateBuyerSettings({
    companyName: body?.companyName || "",
    billingEmail: body?.billingEmail || ""
  });

  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  reportOperationalEvent("buyer_profile_update_triggered", "Buyer settings profile update triggered.", {
    userId: user.id,
    billingEmailDomain: validation.value.billingEmail.split("@")[1] || null
  });

  const { data, error } = await supabase
    .from("buyer_profiles")
    .update(buildBuyerProfileUpdate(validation.value))
    .eq("user_id", user.id)
    .select("company_name, billing_email")
    .maybeSingle();

  if (error) {
    reportOperationalError("buyer_profile_update_failed", error, {
      userId: user.id
    });
    return NextResponse.json({ error: "Unable to save changes right now." }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Complete buyer onboarding before editing company settings." }, { status: 409 });
  }

  return NextResponse.json({
    profile: {
      companyName: data.company_name,
      billingEmail: data.billing_email
    }
  });
}
