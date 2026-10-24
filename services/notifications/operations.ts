"use server";
import { createServerSupabaseClient } from "@/services/supabase/server";
import { assertPrivilegedAssurance } from "@/services/auth/security";
import { redirect } from "next/navigation";
export async function readNotificationOperations(){const db=await createServerSupabaseClient();await assertPrivilegedAssurance(db);const r=await db.rpc("notification_operations");if(r.error)throw Error("notification_operations_unavailable");return r.data;}
export async function retryNotification(form:FormData){const db=await createServerSupabaseClient();await assertPrivilegedAssurance(db);const id=String(form.get("id")??""),reason=String(form.get("reason")??"");if(!/^[0-9a-f-]{36}$/.test(id)||reason.length<10||reason.length>1000)redirect("/admin/notifications?error=invalid");const r=await db.rpc("notification_retry",{p_id:id,p_reason:reason});redirect(r.error?"/admin/notifications?error=unsafe_replay":"/admin/notifications?retried=yes");}
