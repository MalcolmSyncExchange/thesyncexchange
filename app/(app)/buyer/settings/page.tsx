import { BuyerSettingsForm } from "@/components/buyer/buyer-settings-form";
import { getBuyerOrders } from "@/services/buyer/queries";
import { mapLegalOrdersForSettings, mapNotificationPreferencesRow } from "@/services/buyer/settings";
import { requireSession } from "@/services/auth/session";
import { loadBuyerInvoices } from "@/services/buyer/invoices";
import { isMissingRelationError, isSchemaCacheTableError } from "@/services/supabase/schema-compat";
import { createServerSupabaseClient } from "@/services/supabase/server";
import { env } from "@/lib/env";
import { getBillingPortalRuntimeConfiguration } from "@/lib/server-env";
import { buyerProfiles } from "@/lib/demo-data";

export const dynamic = "force-dynamic";

export default async function BuyerSettingsPage() {
  const sessionUser = await requireSession("buyer");
  const billingPortalEnabled = getBillingPortalRuntimeConfiguration().enabled;
  // Match the other buyer screens' explicit local demo mode. Production still
  // loads the authenticated account and its existing settings below.
  if (env.demoMode) {
    const profile = buyerProfiles.find(profile => profile.user_id === sessionUser.id);
    return <BuyerSettingsForm
      initialCompanyName={profile?.company_name || ""}
      initialBillingEmail={profile?.billing_email || sessionUser.email}
      currentEmail={sessionUser.email}
      billingPortalEnabled={billingPortalEnabled}
      legalOrders={mapLegalOrdersForSettings(await getBuyerOrders(sessionUser.id))}
    />;
  }
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const [{ data: buyerProfile }, notificationPreferences, teamInvites, orders, invoices] = await Promise.all([
    user?.id ? supabase.from("buyer_profiles").select("company_name, billing_email").eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
    loadNotificationPreferences(supabase),
    loadTeamInvites(supabase, sessionUser.id),
    getBuyerOrders(sessionUser.id),
    loadBuyerInvoices()
  ]);

  return (
    <BuyerSettingsForm
      initialCompanyName={buyerProfile?.company_name || ""}
      initialBillingEmail={buyerProfile?.billing_email || user?.email || ""}
      currentEmail={user?.email || ""}
      billingPortalEnabled={billingPortalEnabled}
      initialNotificationPreferences={notificationPreferences}
      initialTeamInvites={teamInvites}
      invoices={invoices.invoices}
      invoiceStatus={invoices.status}
      legalOrders={mapLegalOrdersForSettings(orders)}
    />
  );
}

async function loadNotificationPreferences(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>) {
  const {data,error}=await supabase.rpc("notification_preferences");
  if(error)throw Error("Notification preferences unavailable");
  const canonical=data as {marketing?:boolean}|null;
  return mapNotificationPreferencesRow({purchase_receipts:true,license_agreement_ready:true,security_alerts:true,platform_updates:canonical?.marketing===true});
}

async function loadTeamInvites(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, userId: string) {
  const { data, error } = await supabase
    .from("buyer_team_invites")
    .select("id, email, role, status, created_at")
    .eq("buyer_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error && !isMissingRelationError(error, "buyer_team_invites") && !isSchemaCacheTableError(error, "buyer_team_invites")) {
    throw error;
  }

  return data || [];
}
