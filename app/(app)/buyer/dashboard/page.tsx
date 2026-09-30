import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronRight, Music2 } from "lucide-react";
import { BuyerSearch } from "@/components/buyer/buyer-search";
import { BuyerTrackCard } from "@/components/catalog/buyer-track-card";
import { getBuyerDashboardData } from "@/services/buyer/queries";
import { requireSession } from "@/services/auth/session";
import surface from "@/components/layout/sync-surface.module.css";
import styles from "@/components/buyer/buyer-workspace.module.css";

export default async function BuyerDashboardPage() {
  const user = await requireSession("buyer");
  const { favorites, orders, featuredTracks, catalogCount } = await getBuyerDashboardData(user.id);
  return <div className={styles.dashboard}>
    <header><p className={surface.eyebrow}>Buyer overview</p><h1 className={surface.heading}>Your next project starts here.</h1><p className={surface.description}>Find a sound that fits. Pick up a shortlist. Bring your next idea to life.</p><BuyerSearch /></header>
    <div className={styles.metrics}>
      {[["Saved tracks", favorites.length, "/buyer/favorites"],["Orders placed",orders.length,"/buyer/orders"],["Tracks to explore",catalogCount,"/buyer/catalog"]].map(([label,count,href])=><Link href={String(href)} key={label}><dl><dt>{label}</dt><dd>{count}</dd></dl></Link>)}
    </div>
    <div className={styles.columns}>
      <section className={styles.section} aria-labelledby="explore-title"><div className={styles.sectionHeader}><h2 id="explore-title">Explore the catalog</h2><Link href="/buyer/catalog">View all music<ArrowRight aria-hidden="true" size={16} /></Link></div>
        {featuredTracks.length ? featuredTracks.map(track=><BuyerTrackCard key={track.id} track={track} href={`/buyer/catalog/${track.slug}`} layout="list" />) : <div className={styles.empty}><h3>New music is on its way</h3><p>Approved tracks will appear here as they become available.</p></div>}
      </section>
      <aside className={styles.section}><div className={styles.sectionHeader}><h2>Your shortlist</h2><Link href="/buyer/favorites">View saved<ArrowRight aria-hidden="true" size={16} /></Link></div>
        {favorites.length ? favorites.slice(0,3).map(track=><Link href={`/buyer/catalog/${track.slug}`} key={track.id} className={styles.savedRow}><span className={styles.cover}>{track.cover_art_url ? <Image src={track.cover_art_url} alt="" fill sizes="48px" className="object-cover" /> : <Music2 aria-hidden="true" size={22} />}</span><div><strong>{track.title}</strong><p>{track.artist_name}</p></div><ChevronRight aria-hidden="true" size={18} /></Link>) : <div className={styles.empty}><h3>Keep the good ones close.</h3><p>Save tracks while you browse to build your first shortlist.</p><Link href="/buyer/catalog" className={surface.link}>Discover music<ArrowRight aria-hidden="true" size={16} /></Link></div>}
        <div className={styles.help}><h3>Ready to use a track?</h3><p>Open its details to compare license options for your project. After purchase, return to your orders for your license agreement.</p><Link href="/buyer/orders" className={surface.link}>Licenses & orders<ArrowRight aria-hidden="true" size={16} /></Link></div>
      </aside>
    </div>
  </div>;
}
