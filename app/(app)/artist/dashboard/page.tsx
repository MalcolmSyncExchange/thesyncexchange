import { ArtistDashboard } from "@/components/artist/artist-dashboard";
import { getArtistDashboardSummary, toArtistDashboardTracks } from "@/lib/artist-dashboard";
import { getArtistWorkspaceData } from "@/services/artist/queries";
import { requireSession } from "@/services/auth/session";

export default async function ArtistDashboardPage({ searchParams }: { searchParams?: Promise<{ setup?: string }> }) {
  const params = await searchParams;
  const user = await requireSession("artist");
  const { tracks } = await getArtistWorkspaceData(user.id);
  return <>{params?.setup === "complete" && user.onboardingComplete ? <p role="status" className="mb-6 rounded-lg border border-accent p-4">Artist setup is complete. Your profile is saved; every track still requires its own rights and catalog review.</p> : null}<ArtistDashboard tracks={toArtistDashboardTracks(tracks)} summary={getArtistDashboardSummary(tracks)} /></>;
}
