import Link from "next/link";
import Image from "next/image";
import {getMarketplacePage} from "@/services/buyer/marketplace";
import {BuyerPreviewQueue} from "@/components/audio/buyer-discovery-provider";
import { notFound } from "next/navigation";

import { PreviewButton } from "@/components/audio/buyer-discovery-provider";
import { FavoriteButton } from "@/components/catalog/favorite-button";
import { BuyerTrackCard } from "@/components/catalog/buyer-track-card";
import { BuyerLicenseSelector } from "@/components/catalog/buyer-license-selector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDuration } from "@/lib/utils";
import { getPaymentDisplayConfiguration } from "@/lib/server-env";
import { getTrackLicenseOffers } from "@/services/orders/license-offers";
import { licenseDetailHref, readBuyerSelection } from "@/lib/licenses/selection";
import { env } from "@/lib/env";
import { requireSession } from "@/services/auth/session";
import { getBuyerTrackBySlug } from "@/services/buyer/queries";

export default async function BuyerTrackDetailPage(props: { params: Promise<{ slug: string }>; searchParams?: Promise<{ licenseTypeId?: string | string[]; selection?: string }> }) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const user = await requireSession("buyer");
  const track = await getBuyerTrackBySlug(params.slug, user.id);
  if (!track) notFound();
  const offers = getTrackLicenseOffers(track);
  const selection = readBuyerSelection(searchParams?.licenseTypeId, env.demoMode);
  const selected = offers.find(offer => offer.licenseTypeId === selection?.licenseTypeId)?.licenseTypeId || null;
  const invalidSelection = searchParams?.selection === "unavailable" || (searchParams?.licenseTypeId !== undefined && !selected);
  const payment = getPaymentDisplayConfiguration();

  const related=(await getMarketplacePage(user.id,{genre:track.genre,exclude:track.id})).items.slice(0,3);

  return (
    <div className="space-y-8">
      <BuyerPreviewQueue tracks={[track,...related]}/>
      <Link href="/buyer/catalog" className="text-sm underline">Back to discovery</Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge>{track.genre}</Badge>
            {track.mood.map((mood) => (
              <Badge key={mood} variant="outline">
                {mood}
              </Badge>
            ))}
          </div>
          <h1 className="mt-4 text-4xl font-semibold">{track.title}</h1>
          <p className="mt-2 text-lg text-muted-foreground">{track.artist_id?<Link href={`/buyer/artists/${track.artist_id}`} className="underline underline-offset-4">{track.artist_name}</Link>:track.artist_name}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link className="text-sm underline" href={`/account/conversations?track=${track.id}`}>Ask about licensing</Link>
          <FavoriteButton trackTitle={track.title} trackId={track.id} initialFavorite={Boolean(track.is_favorite)} revalidatePathname={`/buyer/catalog/${track.slug}`} />
          <Button asChild size="lg" data-testid="license-track-button">
            <Link href={licenseDetailHref(track.slug, selected)}>Select License</Link>
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4">{track.cover_art_url?<Image src={track.cover_art_url} alt={`${track.title} artwork`} width={160} height={160} unoptimized className="rounded-lg object-cover"/>:null}<PreviewButton surface="track_detail" track={track} /><p className="text-sm text-muted-foreground">A limited preview. Original masters require a verified license entitlement.</p></div>
      <div className="grid gap-6 lg:grid-cols-[1fr,360px]">
        <Card>
          <CardHeader>
            <CardTitle>Track detail</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-muted-foreground">{track.description}</p>
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              {[
                ["BPM", track.bpm==null?"Not specified":`${track.bpm}`],
                ["Key", track.key],
                ["Duration", formatDuration(track.duration_seconds)],
                ["Classification", track.catalog_metadata?.vocal || (track.vocals?"Vocal":"Instrumental")],
                ["Explicit content", track.catalog_metadata?.explicit || (track.explicit?"Explicit":"Clean")],
                ["Language", track.catalog_metadata?.language || "Not specified"],
                ["Subgenre", track.subgenre || "Not specified"],
                ["Release", [track.catalog_metadata?.releaseTitle,track.catalog_metadata?.releaseStatus,track.catalog_metadata?.releaseDate||track.release_year].filter(Boolean).join(" · ") || "Not specified"]
              ].map(([label, value]) => (
                <div key={label} className="rounded-md border border-border p-4">
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="mt-1 font-medium">{value}</p>
                </div>
              ))}
            </div>
            {track.catalog_metadata?.credits.length?<div className="rounded-lg border border-border p-4"><h2 className="text-sm font-medium">Public credits</h2><ul className="mt-3 space-y-2">{track.catalog_metadata.credits.map((credit,i)=><li key={i} className="text-sm">{credit.name} · {credit.role.replaceAll("_"," ")}</li>)}</ul></div>:null}
            <p className="text-sm text-muted-foreground">Available audio versions and supporting materials are listed with each reviewed license. A preview does not authorize use.</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="min-w-0 pt-6">
            <BuyerLicenseSelector key={track.id} noncommercialDemo={env.demoMode} trackId={track.id} trackSlug={track.slug} offers={offers}
              initialLicenseTypeId={selected} invalidSelection={invalidSelection} paymentAvailable={payment.checkoutAvailable} />
          </CardContent>
        </Card>
      </div>
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Related tracks</h2>
        {!related.length?<p className="text-sm text-muted-foreground">More related music will appear as it becomes eligible.</p>:null}
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {related.map((item) => (
            <BuyerTrackCard key={item.id} track={item} href={`/buyer/catalog/${item.slug}`} />
          ))}
        </div>
      </section>
    </div>
  );
}
