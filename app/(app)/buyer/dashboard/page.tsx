import Link from "next/link";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getBuyerDashboardData } from "@/services/buyer/queries";
import { requireSession } from "@/services/auth/session";

export default async function BuyerDashboardPage() {
  const user = await requireSession("buyer");
  const { favorites, orders, featuredTracks, catalogCount } = await getBuyerDashboardData(user.id);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold">Buyer dashboard</h1>
        <p className="mt-2 text-muted-foreground">Track shortlists, licensing activity, and quick re-entry into active searches.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard title="Saved tracks" value={String(favorites.length)} change={`${Math.min(favorites.length, 2)} ready for internal review`} />
        <StatCard title="Orders placed" value={String(orders.length)} change={orders[0] ? `Latest status: ${orders[0].order_status}` : "No completed purchases yet"} />
        <StatCard title="Approved catalog" value={String(catalogCount)} change="Explore tracks available for licensing" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Explore the catalog</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {featuredTracks.length ? featuredTracks.map((track) => (
              <div key={track.id} className="rounded-md border border-border p-4">
                <Link href={`/buyer/catalog/${track.slug}`} className="font-medium underline-offset-4 hover:underline">{track.title}</Link>
                <p className="text-sm text-muted-foreground">{track.artist_name}</p>
              </div>
            )) : <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">Approved catalog activity will appear here once tracks are live.</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Saved shortlist</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {favorites.length ? favorites.map((track) => (
              <div key={track.id} className="rounded-md border border-border p-4">
                <Link href={`/buyer/catalog/${track.slug}`} className="font-medium underline-offset-4 hover:underline">{track.title}</Link>
                <p className="text-sm text-muted-foreground">{track.genre}</p>
              </div>
            )) : <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground"><Link href="/buyer/catalog" className="underline">Explore music and save your first favorite.</Link></div>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
