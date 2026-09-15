import Link from "next/link";
import surface from "@/components/layout/sync-surface.module.css";
import styles from "@/components/buyer/buyer-workspace.module.css";
import { BuyerTrackCard } from "@/components/catalog/buyer-track-card";
import { getBuyerFavorites } from "@/services/buyer/queries";
import { requireSession } from "@/services/auth/session";

export default async function FavoritesPage() {
  const user = await requireSession("buyer");
  const savedTracks = await getBuyerFavorites(user.id);

  return (
    <div className="space-y-6">
      <header><p className={surface.eyebrow}>Your shortlist</p><h1 className={surface.heading}>Keep the good ones close.</h1><p className={surface.description}>Your saved tracks, ready for another listen.</p></header>
      {savedTracks.length ? (
        <div className={styles.trackList}>
          {savedTracks.map((track) => (
            <BuyerTrackCard key={track.id} track={track} href={`/buyer/catalog/${track.slug}`} layout="list" />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-muted-foreground">
          <p>Save tracks from the catalog to build your shortlist.</p><Link href="/buyer/catalog" className={surface.link}>Discover music</Link>
        </div>
      )}
    </div>
  );
}
