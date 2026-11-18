import { NextResponse } from "next/server";
import { authorizeBuyerAccountMutation, readAccountJson } from "@/services/auth/account-mutations";

import { reportOperationalEvent } from "@/lib/monitoring";
import {
  mapNotificationPreferencesRow,
  normalizeNotificationPreferences
} from "@/services/buyer/settings";

export async function PATCH(request: Request) {
  const access = await authorizeBuyerAccountMutation(request, false);
  if (access.response) return access.response;
  const supabase=access.db!,auth={user:access.user!};
  const body=await readAccountJson(request);
  if(!body || ["purchaseReceipts","licenseAgreementReady","platformUpdates"].some(key=>typeof body[key]!=="boolean"))return NextResponse.json({error:"Valid notification settings required."},{status:400});
  const preferences = normalizeNotificationPreferences({
    purchaseReceipts: Boolean(body?.purchaseReceipts),
    licenseAgreementReady: Boolean(body?.licenseAgreementReady),
    platformUpdates: Boolean(body?.platformUpdates),
    securityAlerts: true
  });

  reportOperationalEvent("buyer_notification_preferences_update_triggered", "Buyer notification preferences update triggered.", {
    userId: auth.user.id
  });

  const saved=await supabase.rpc("notification_preferences",{p_marketing:preferences.platformUpdates,p_notice:"notifications-v1"});
  if(saved.error)return NextResponse.json({error:"Unable to save notification preferences."},{status:503});

  return NextResponse.json({
    preferences: mapNotificationPreferencesRow({purchase_receipts:true,license_agreement_ready:true,security_alerts:true,platform_updates:preferences.platformUpdates})
  });
}
