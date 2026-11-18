import "server-only";
import { artistDeclarationsSchema, artistIdentitySchema, emptyArtistAccount } from "@/lib/artist/account-contract";
import notice from "@/lib/artist/onboarding-notice.json";
import { requireAccountScope } from "@/services/auth/authorization";
import { shouldUseDemoData } from "@/lib/env";

export async function getArtistAccountDetails(userId: string, email: string) {
  // The local demo store never receives private legal/contact declarations.
  if (shouldUseDemoData()) return emptyArtistAccount(email);
  const { supabase } = await requireAccountScope("artist", userId);
  const [details, acceptance] = await Promise.all([
    supabase.from("artist_account_details").select("identity,declarations").eq("user_id", userId).maybeSingle(),
    supabase.from("artist_account_acceptances").select("notice_version").eq("user_id", userId).eq("notice_version", notice.version).maybeSingle()
  ]);
  if (details.error || acceptance.error) throw new Error("Unable to load private artist preparation. Reload or contact support.");
  const identity = artistIdentitySchema.safeParse(details.data?.identity), declarations = artistDeclarationsSchema.safeParse(details.data?.declarations);
  return { ...emptyArtistAccount(email), ...(identity.success ? identity.data : {}), ...(declarations.success ? declarations.data : {}), noticeAccepted: Boolean(acceptance.data) };
}

// Preview intentionally never loads private account declarations, finance or preferences.
export async function getArtistPublicPresentation(userId: string) {
  const { supabase } = await requireAccountScope("artist", userId);
  const { data, error } = await supabase.from("artist_profiles")
    .select("artist_name,bio,location,website,instagram_url,spotify_url,youtube_url")
    .eq("user_id", userId).single();
  if (error || !data) throw new Error("Unable to load the saved artist presentation.");
  return data;
}
