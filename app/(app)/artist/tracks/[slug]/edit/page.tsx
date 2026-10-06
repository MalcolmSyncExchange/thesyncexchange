import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";

import { SubmitMusicForm } from "@/components/forms/submit-music-form";
import { getArtistTrackBySlug } from "@/services/artist/queries";
import { requireSession } from "@/services/auth/session";

export default async function ArtistTrackCompatibilityEditPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireSession("artist");
  const track = await getArtistTrackBySlug(user.id, slug);
  if (!track) notFound();
  return (
    <div className="space-y-6 pt-4">
      <Link href={`/artist/tracks/${track.slug}`} className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft aria-hidden="true" className="h-4 w-4" />Back to Track Detail</Link>
      <div><p className="text-xs font-semibold uppercase tracking-[.18em] text-muted-foreground">Compatibility editor</p><h1 className="mt-2 text-3xl font-semibold">Edit {track.title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">The existing editor remains available while focused section editing is delivered in a later approved slice.</p></div>
      <SubmitMusicForm mode="edit" track={track} />
    </div>
  );
}
