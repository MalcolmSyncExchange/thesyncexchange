import { notFound } from "next/navigation";

import { AudioPlayer } from "@/components/audio/audio-player";
import { SubmitMusicForm } from "@/components/forms/submit-music-form";
import { Badge } from "@/components/ui/badge";
import { getArtistTrackBySlug } from "@/services/artist/queries";
import { requireSession } from "@/services/auth/session";

export default async function ArtistTrackEditPage({ params }: { params: { slug: string } }) {
  const user = await requireSession("artist");
  const track = await getArtistTrackBySlug(user.id, params.slug);
  if (!track) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">{track.title}</h1>
          <p className="mt-2 text-muted-foreground">Edit metadata, splits, and pricing before the next licensing cycle.</p>
        </div>
        <Badge>{track.status.replace("_", " ")}</Badge>
      </div>
      <AudioPlayer title={track.title} artist={track.artist_name} src={track.audio_file_url} />
      <SubmitMusicForm mode="edit" track={track} />
    </div>
  );
}
