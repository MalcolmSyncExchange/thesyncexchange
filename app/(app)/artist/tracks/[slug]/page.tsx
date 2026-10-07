import { notFound } from "next/navigation";

import { ArtistTrackDetail } from "@/components/artist/tracks/artist-track-detail";
import { getArtistTrackDetail } from "@/services/artist/queries";
import { requireSession } from "@/services/auth/session";

export default async function ArtistTrackDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireSession("artist");
  const track = await getArtistTrackDetail(user.id, slug);
  if (!track) notFound();
  return <ArtistTrackDetail track={track} />;
}
