"use server";
import { createServerSupabaseClient } from "@/services/supabase/server";
import { redirect } from "next/navigation";
export async function saveAnalyticsPreferences(form: FormData) {
  const db = await createServerSupabaseClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) redirect("/login");
  const notice = String(form.get("notice") ?? "");
  if (notice !== "analytics-optional-v1") redirect("/account/analytics?error=current_notice_required");
  const saved = await db.rpc("analytics_preferences", { p_consent: form.get("consent") === "yes", p_notice: notice });
  redirect(saved.error ? "/account/analytics?error=preferences_unavailable" : "/account/analytics?saved=yes");
}
