import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getBuyerDashboardData } from "@/services/buyer/queries";
import { requireSession } from "@/services/auth/session";

export default async function BuyerDashboardPage() {
  const user = await requireSession("buyer");
  const { favorites, orders, recentlyViewed } = await getBuyerDashboardData(user.id);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold">Buyer dashboard</h1>
        <p className="mt-2 text-muted-foreground">Track shortlists, licensing activity, and quick re-entry into active searches.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard title="Saved tracks" value={String(favorites.length)} change={`${Math.min(favorites.length, 2)} ready for internal review`} />
        <StatCard title="Orders placed" value={String(orders.length)} change={orders[0] ? `Latest status: ${orders[0].order_status}` : "No completed purchases yet"} />
        <StatCard title="Approved catalog" value={String(recentlyViewed.length)} change="Fresh approved tracks surface here first" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recently viewed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {recentlyViewed.length ? recentlyViewed.map((track) => (
              <div key={track.id} className="rounded-md border border-border p-4">
                <p className="font-medium">{track.title}</p>
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
                <p className="font-medium">{track.title}</p>
                <p className="text-sm text-muted-foreground">{track.genre}</p>
              </div>
            )) : <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">Favorites you save from the catalog will appear here.</div>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
