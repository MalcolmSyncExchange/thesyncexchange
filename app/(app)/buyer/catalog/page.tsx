import { CatalogBrowser } from "@/components/catalog/catalog-browser";
import { getBuyerCatalogTracks } from "@/services/buyer/queries";

export default async function BuyerCatalogPage() {
  const tracks = await getBuyerCatalogTracks();

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
