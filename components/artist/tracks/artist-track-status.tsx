import { DomainStatus } from "@/components/ui/domain-status";
import { getArtistTrackPresentationStatus } from "@/lib/artist-track-presentation";
import type { ArtistCatalogTrack } from "@/services/artist/catalog-contract";

type StatusTrack = Pick<ArtistCatalogTrack, "status" | "statusLabel" | "buyerVisibility">;

export function ArtistTrackStatus({ track, className }: { track: StatusTrack; className?: string }) {
  const status = getArtistTrackPresentationStatus(track);
  return (
    <span className={className}>
      <DomainStatus tone={status.tone}>{status.label}</DomainStatus>
      <small>{status.visibility}</small>
    </span>
  );
}
