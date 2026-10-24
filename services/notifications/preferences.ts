"use server";
import { createServerSupabaseClient } from "@/services/supabase/server";
import { redirect } from "next/navigation";
export async function saveNotificationPreferences(form:FormData){
 const db=await createServerSupabaseClient();const {data:{user},error}=await db.auth.getUser();if(error||!user)redirect("/login");
 const notice=String(form.get("notice")??"");if(notice!=="notifications-v1")redirect("/account/notifications?error=current_notice_required");
 const r=await db.rpc("notification_preferences",{p_operational:form.get("operational")==="yes",p_marketing:form.get("marketing")==="yes",p_notice:notice});
 redirect(r.error?"/account/notifications?error=unavailable":"/account/notifications?saved=yes");
}
