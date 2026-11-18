import "server-only";
import { analyticsConfig } from "./server";
import { createServerSupabaseClient } from "@/services/supabase/server";
export async function browserAnalyticsEnabled(): Promise<boolean> {
 if(!analyticsConfig())return false;
 try{const db=await createServerSupabaseClient();const {data,error}=await db.rpc("analytics_preferences");
  return !error && !!data && typeof data==="object" && !Array.isArray(data) && data.consented===true && data.deliveryEnabled===true;
 }catch{return false;}
}
