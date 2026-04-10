import { CatalogBrowser } from "@/components/catalog/catalog-browser";
import { getArtistWorkspaceData } from "@/services/artist/queries";
import { requireSession } from "@/services/auth/session";

export default async function ArtistCatalogPage() {
  const user = await requireSession("artist");
  const { tracks } = await getArtistWorkspaceData(user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">My catalog</h1>
        <p className="mt-2 text-muted-foreground">Review approved tracks, drafts, and submissions awaiting admin decision.</p>
      </div>
      <CatalogBrowser tracks={tracks} basePath="/artist/tracks" />
    </div>
  );
}
