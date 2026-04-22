import { CatalogBrowser } from "@/components/catalog/catalog-browser";
import { requireSession } from "@/services/auth/session";
import { getBuyerCatalogTracks } from "@/services/buyer/queries";

export default async function BuyerCatalogPage() {
  const user = await requireSession("buyer");
  const tracks = await getBuyerCatalogTracks(user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Catalog</h1>
        <p className="mt-2 text-muted-foreground">Search premium tracks with clear licensing posture, creative metadata, and rights visibility.</p>
      </div>
      <CatalogBrowser tracks={tracks} basePath="/buyer/catalog" />
    </div>
  );
}
