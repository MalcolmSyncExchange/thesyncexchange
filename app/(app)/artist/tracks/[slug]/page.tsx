import Link from "next/link";
import { findTrackUpload } from "@/services/media/uploads";
import { notFound } from "next/navigation";

import { ArtistTrackDetail } from "@/components/artist/tracks/artist-track-detail";
import { getArtistTrackDetail } from "@/services/artist/queries";
import { requireSession } from "@/services/auth/session";

export default async function ArtistTrackDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireSession("artist");
  const track = await getArtistTrackDetail(user.id, slug);
  if (!track) notFound();
  const mediaSubmission = await findTrackUpload(track.id);
  return <><Link className="mr-4 inline-block underline" href={"/artist/rights?track="+track.id}>Review master and publishing rights</Link>
            {mediaSubmission ? <Link className="mb-6 inline-block underline" href={"/artist/uploads?draft="+mediaSubmission}>Manage private audio, versions and processing</Link> : null}<ArtistTrackDetail track={track} /></>;
}
