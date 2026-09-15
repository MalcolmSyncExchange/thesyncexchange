import { env, hasSupabaseEnv } from "@/lib/env";
import { getDemoArtistProfile } from "@/services/auth/demo-store";
import { requireAccountScope } from "@/services/auth/authorization";
import type { ArtistFinance } from "@/types/models";

export async function getArtistFinance(userId: string): Promise<ArtistFinance> {
  if (!hasSupabaseEnv || env.demoMode) {
    const profile = await getDemoArtistProfile(userId);
    return { payout_email: profile?.payout_email || null, legal_entity: null };
  }
  const { supabase } = await requireAccountScope("artist", userId);
  const { data, error } = await supabase.rpc("get_own_artist_finance");
  if (error) throw new Error("Unable to load payout settings.");
  return { payout_email: data?.[0]?.payout_email || null, legal_entity: null };
}
