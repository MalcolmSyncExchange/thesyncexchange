import { BuyerCatalogBrowser } from "@/components/catalog/buyer-catalog-browser";
import { requireSession } from "@/services/auth/session";
import { getBuyerOnboardingState } from "@/services/auth/onboarding";
import { getBuyerCatalogTracks } from "@/services/buyer/queries";

export default async function BuyerCatalogPage() {
  const user = await requireSession("buyer");
  const [tracks, onboarding] = await Promise.all([getBuyerCatalogTracks(user.id), getBuyerOnboardingState(user)]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Catalog</h1>
        <p className="mt-2 text-muted-foreground">Search premium tracks with clear licensing posture, creative metadata, and rights visibility.</p>
      </div>
      <BuyerCatalogBrowser tracks={tracks} basePath="/buyer/catalog" interests={{ genres: onboarding.values.genres, moods: onboarding.values.moods }} />
    </div>
  );
}
