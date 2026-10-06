import { ArtistCatalogView } from "@/components/artist/catalog/artist-catalog-view";
import { getArtistCatalogPage } from "@/services/artist/queries";
import { requireSession } from "@/services/auth/session";

export default async function ArtistCatalogPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSession("artist");
  const params = await searchParams;
  const data = await getArtistCatalogPage(user.id, params);
  return <ArtistCatalogView data={data} />;
}
