import { BuyerSettingsForm } from "@/components/buyer/buyer-settings-form";
import { createServerSupabaseClient } from "@/services/supabase/server";

export const dynamic = "force-dynamic";

export default async function BuyerSettingsPage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const { data: buyerProfile } = user?.id
    ? await supabase.from("buyer_profiles").select("company_name, billing_email").eq("user_id", user.id).maybeSingle()
    : { data: null };

  return (
    <BuyerSettingsForm
      initialCompanyName={buyerProfile?.company_name || ""}
      initialBillingEmail={buyerProfile?.billing_email || user?.email || ""}
      currentEmail={user?.email || ""}
    />
  );
}
