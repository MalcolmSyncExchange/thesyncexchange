import surface from "@/components/layout/sync-surface.module.css";
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
        <p className={surface.eyebrow}>Music discovery</p>
        <h1 className={surface.heading}>Find your next sound.</h1>
        <p className={surface.description}>Listen, explore and save music for your next project.</p>
      </div>
      <BuyerCatalogBrowser tracks={tracks} basePath="/buyer/catalog" interests={{ genres: onboarding.values.genres, moods: onboarding.values.moods }} />
    </div>
  );
}
