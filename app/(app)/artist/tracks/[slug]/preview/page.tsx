import { notFound } from "next/navigation";

import { ArtistTrackBuyerPreview } from "@/components/artist/tracks/artist-track-buyer-preview";
import { getArtistTrackBuyerPreview } from "@/services/artist/queries";
import { requireSession } from "@/services/auth/session";

export default async function ArtistTrackBuyerPreviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireSession("artist");
  const data = await getArtistTrackBuyerPreview(user.id, slug);
  if (!data) notFound();
  return <ArtistTrackBuyerPreview data={data} />;
}
