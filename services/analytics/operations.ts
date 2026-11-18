import "server-only";
import { requireAccountScope } from "@/services/auth/authorization";
import { createServerSupabaseClient } from "@/services/supabase/server";
export async function readAnalyticsOperations(environment: "preview"|"production") {
 await requireAccountScope("admin");
 const db=await createServerSupabaseClient();
 const {data,error}=await db.rpc("analytics_operations",{p_environment:environment}).abortSignal(AbortSignal.timeout(5000));
 return error ? null : data;
}
