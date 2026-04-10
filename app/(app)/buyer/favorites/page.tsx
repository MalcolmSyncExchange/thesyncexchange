import { TrackCard } from "@/components/catalog/track-card";
import { getBuyerFavorites } from "@/services/buyer/queries";
import { requireSession } from "@/services/auth/session";

export default async function FavoritesPage() {
  const user = await requireSession("buyer");
  const savedTracks = await getBuyerFavorites(user.id);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Saved tracks</h1>
      {savedTracks.length ? (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {savedTracks.map((track) => (
            <TrackCard key={track.id} track={track} href={`/buyer/catalog/${track.slug}`} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-muted-foreground">
          Save tracks from the catalog to build your shortlist.
        </div>
      )}
    </div>
  );
}
