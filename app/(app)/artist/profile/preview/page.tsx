import Link from "next/link";
import Image from "next/image";
import { artistBuyerPreview } from "@/lib/artist/account-contract";
import { getArtistPublicPresentation } from "@/services/artist/account";
import { requireSession } from "@/services/auth/session";

export default async function ArtistBuyerPreviewPage() {
  const user = await requireSession("artist");
  const profile = await getArtistPublicPresentation(user.id);
  // Explicit projection; never serialize the private account values to this view.
  const preview = artistBuyerPreview(profile, user.avatarUrl || null);
  return <div className="max-w-3xl space-y-6"><header><p className="text-sm uppercase tracking-widest text-muted-foreground">Buyer Preview</p><h1 className="mt-3 text-3xl font-semibold">Your public artist presentation</h1><p className="mt-3 text-muted-foreground">This owner-only preview shows the public profile fields. It does not publish a directory entry or approve your catalog.</p><Link className="mt-3 inline-block underline" href="/artist/profile">Back to profile editor</Link></header>
    <article data-testid="artist-buyer-preview" className="space-y-5 rounded-lg border border-border bg-background p-6">
      {preview.avatarUrl ? <Image unoptimized src={preview.avatarUrl} alt={preview.artistName} width={120} height={120} className="rounded-full object-cover" /> : null}
      <h2 className="text-2xl font-semibold">{preview.artistName}</h2><p className="text-muted-foreground">{preview.location}</p><p className="whitespace-pre-wrap leading-7">{preview.bio}</p>
      <nav aria-label="Artist public links" className="flex flex-wrap gap-4">{Object.entries(preview.links).map(([name,url]) => url ? <a key={name} href={url} target="_blank" rel="noopener noreferrer nofollow" className="capitalize underline">{name}</a> : null)}</nav>
    </article>
  </div>;
}
