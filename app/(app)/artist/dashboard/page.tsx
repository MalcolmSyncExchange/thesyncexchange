import { ArtistDashboard } from "@/components/artist/artist-dashboard";
import { getArtistDashboardSummary, toArtistDashboardTracks } from "@/lib/artist-dashboard";
import { getArtistWorkspaceData } from "@/services/artist/queries";
import { requireSession } from "@/services/auth/session";

export default async function ArtistDashboardPage() {
  const user = await requireSession("artist");
  const { tracks } = await getArtistWorkspaceData(user.id);
  return <ArtistDashboard tracks={toArtistDashboardTracks(tracks)} summary={getArtistDashboardSummary(tracks)} />;
}
