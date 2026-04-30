import { NextResponse } from "next/server";

import { reportOperationalError, reportOperationalEvent } from "@/lib/monitoring";
import {
  assertAuthenticatedBuyerSettingsUser,
  buildNotificationPreferencesUpsert,
  mapNotificationPreferencesRow,
  normalizeNotificationPreferences
} from "@/services/buyer/settings";
import { createServerSupabaseClient } from "@/services/supabase/server";

export async function PATCH(request: Request) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const auth = assertAuthenticatedBuyerSettingsUser(user);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const preferences = normalizeNotificationPreferences({
    purchaseReceipts: Boolean(body?.purchaseReceipts),
    licenseAgreementReady: Boolean(body?.licenseAgreementReady),
    platformUpdates: Boolean(body?.platformUpdates),
    securityAlerts: true
  });

  reportOperationalEvent("buyer_notification_preferences_update_triggered", "Buyer notification preferences update triggered.", {
    userId: auth.user.id
  });

  const { data, error } = await supabase
    .from("buyer_notification_preferences")
    .upsert(buildNotificationPreferencesUpsert(auth.user.id, preferences), { onConflict: "user_id" })
    .select("purchase_receipts, license_agreement_ready, platform_updates, security_alerts")
    .maybeSingle();

  if (error) {
    reportOperationalError("buyer_notification_preferences_update_failed", error, {
      userId: auth.user.id
    });
    return NextResponse.json({ error: "Unable to save notification preferences right now." }, { status: 500 });
  }

  return NextResponse.json({
    preferences: mapNotificationPreferencesRow(data)
  });
}
