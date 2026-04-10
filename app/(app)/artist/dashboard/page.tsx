import Link from "next/link";

import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getArtistWorkspaceData } from "@/services/artist/queries";
import { requireSession } from "@/services/auth/session";

export default async function ArtistDashboardPage() {
  const user = await requireSession("artist");
  const { tracks } = await getArtistWorkspaceData(user.id);
  const pendingCount = tracks.filter((track) => track.status === "pending_review").length;
  const approvedCount = tracks.filter((track) => track.status === "approved").length;
  const draftCount = tracks.filter((track) => track.status === "draft").length;
  const recentActivity = buildRecentActivity(tracks);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Artist dashboard</h1>
          <p className="mt-2 text-muted-foreground">Monitor submissions, track approvals, and keep your catalog buyer-ready.</p>
        </div>
        <Button asChild>
          <Link href="/artist/submit">Submit Music</Link>
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard title="Tracks submitted" value={String(tracks.length)} change={`${approvedCount} approved for buyers`} />
        <StatCard title="Pending review" value={String(pendingCount)} change={`${draftCount} still in draft`} />
        <StatCard title="Catalog live" value={String(approvedCount)} change="Submission status updates appear here" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.1fr,0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {recentActivity.map((item) => (
              <div key={item} className="rounded-md border border-border p-4 text-sm text-muted-foreground">
                {item}
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Catalog snapshot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {tracks.slice(0, 3).map((track) => (
              <div key={track.id} className="flex items-center justify-between rounded-md border border-border p-4">
                <div>
                  <p className="font-medium">{track.title}</p>
                  <p className="text-sm text-muted-foreground">{track.status.replace("_", " ")}</p>
                </div>
                <Link href={`/artist/tracks/${track.slug}`} className="text-sm font-medium">
                  Edit
                </Link>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function buildRecentActivity(tracks: Awaited<ReturnType<typeof getArtistWorkspaceData>>["tracks"]) {
  if (!tracks.length) {
    return ["Your first submission will appear here once it is saved."];
  }

  return tracks.slice(0, 3).map((track) => {
    if (track.status === "approved") {
      return `${track.title} is approved and visible in the catalog.`;
    }

    if (track.status === "pending_review") {
      return `${track.title} is waiting for admin review.`;
    }

    return `${track.title} is saved as a draft and ready for completion.`;
  });
}
