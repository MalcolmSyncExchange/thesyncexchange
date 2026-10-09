import type { ArtistCatalogTrack } from "@/services/artist/catalog-contract";

type StatusTrack = Pick<ArtistCatalogTrack, "status" | "statusLabel" | "buyerVisibility">;
type StatusTone = "success" | "info" | "warning" | "neutral";

/** Review state and Buyer visibility are separate facts, even when both are shown together. */
export function getArtistTrackPresentationStatus(track: StatusTrack): {
  label: string;
  tone: StatusTone;
  visibility: string;
} {
  if (track.status === "approved" && track.buyerVisibility.eligible) {
    return { label: "Discoverable", tone: "success", visibility: "Review approved · visible in Discover" };
  }

  const tone: StatusTone = track.status === "rejected"
    ? "warning"
    : track.status === "pending_review" || track.status === "approved"
      ? "info"
      : "neutral";
  const visibility = track.status === "approved"
    ? "Buyer visibility: Needs attention"
    : "Buyer visibility: Not discoverable";
  return { label: track.statusLabel, tone, visibility };
}
