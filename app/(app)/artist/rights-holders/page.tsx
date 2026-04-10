import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getArtistWorkspaceData } from "@/services/artist/queries";
import { requireSession } from "@/services/auth/session";

export default async function RightsHoldersPage() {
  const user = await requireSession("artist");
  const { tracks } = await getArtistWorkspaceData(user.id);
  const rights = tracks
    .flatMap((track) => track.rights_holders.map((holder) => ({ ...holder, trackTitle: track.title })));

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Rights holders</h1>
      <Card>
        <CardHeader>
        <CardTitle>Split management</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {rights.length ? rights.map((holder) => (
            <div key={holder.id} className="grid gap-3 rounded-md border border-border p-4 md:grid-cols-4">
              <div>
                <p className="text-sm text-muted-foreground">Track</p>
                <p className="font-medium">{holder.trackTitle}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Holder</p>
                <p className="font-medium">{holder.name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Role</p>
                <p className="font-medium">{holder.role_type}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Ownership</p>
                <p className="font-medium">{holder.ownership_percent}%</p>
              </div>
            </div>
          )) : <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">Rights holders will appear here after your first submission.</div>}
        </CardContent>
      </Card>
    </div>
  );
}
