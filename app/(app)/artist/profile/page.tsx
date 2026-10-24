import { ArtistProfileEditor } from "@/components/artist/profile/artist-profile-editor";
import { getArtistOnboardingState } from "@/services/auth/onboarding";
import { requireSession } from "@/services/auth/session";

export default async function ArtistProfilePage({ searchParams }: { searchParams?: Promise<{ saved?: string; error?: string }> }) {
  const user = await requireSession("artist");
  const params = await searchParams;
  const state = await getArtistOnboardingState(user);
  return <ArtistProfileEditor values={state.values} saved={params?.saved === "1"} error={params?.error} />;
}
