import { BuyerSettingsForm } from "@/components/buyer/buyer-settings-form";
import { getBuyerOrders } from "@/services/buyer/queries";
import { mapLegalOrdersForSettings, mapNotificationPreferencesRow, mapStripeInvoice } from "@/services/buyer/settings";
import { requireSession } from "@/services/auth/session";
import { getStripeServerClient } from "@/services/stripe/server";
import { isMissingRelationError, isSchemaCacheTableError } from "@/services/supabase/schema-compat";
import { createServerSupabaseClient } from "@/services/supabase/server";

export const dynamic = "force-dynamic";

export default async function BuyerSettingsPage() {
  const sessionUser = await requireSession("buyer");
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const [{ data: buyerProfile }, notificationPreferences, teamInvites, orders, invoices] = await Promise.all([
    user?.id ? supabase.from("buyer_profiles").select("company_name, billing_email").eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
    loadNotificationPreferences(supabase, sessionUser.id),
    loadTeamInvites(supabase, sessionUser.id),
    getBuyerOrders(sessionUser.id),
    loadStripeInvoices(user?.email || sessionUser.email)
  ]);

  return (
    <BuyerSettingsForm
      initialCompanyName={buyerProfile?.company_name || ""}
      initialBillingEmail={buyerProfile?.billing_email || user?.email || ""}
      currentEmail={user?.email || ""}
      initialNotificationPreferences={notificationPreferences}
      initialTeamInvites={teamInvites}
      invoices={invoices}
      legalOrders={mapLegalOrdersForSettings(orders)}
    />
  );
}

async function loadNotificationPreferences(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data, error } = await supabase
    .from("buyer_notification_preferences")
    .select("purchase_receipts, license_agreement_ready, platform_updates, security_alerts")
    .eq("user_id", userId)
    .maybeSingle();

  if (error && !isMissingRelationError(error, "buyer_notification_preferences") && !isSchemaCacheTableError(error, "buyer_notification_preferences")) {
    throw error;
  }

  return mapNotificationPreferencesRow(data);
}

async function loadTeamInvites(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
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

async function loadStripeInvoices(email: string | null | undefined) {
  if (!email) {
    return [];
  }

  const stripe = getStripeServerClient();
  if (!stripe) {
    return [];
  }

  const customers = await stripe.customers.list({ email, limit: 1 }).catch(() => ({ data: [] }));
  const customer = customers.data[0];
  if (!customer) {
    return [];
  }

  const invoices = await stripe.invoices.list({ customer: customer.id, limit: 5 }).catch(() => ({ data: [] }));
  return invoices.data.map(mapStripeInvoice);
}
