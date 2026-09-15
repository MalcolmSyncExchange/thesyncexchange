import type { Track } from "../types/models.ts";

export const artistDashboardStatuses = {
  draft: { label: "Draft", stage: 0, action: "Continue draft", description: "Complete your track details before sending it for review." },
  pending_review: { label: "In review", stage: 1, action: "View submission", description: "Your submission is with the review team. Approval is a separate step." },
  approved: { label: "Live", stage: 2, action: "View track", description: "This approved track appears in the buyer catalog." },
  rejected: { label: "Rejected", stage: -1, action: "Review track details", description: "This submission was not approved. Review your track details before preparing another submission." },
  archived: { label: "Archived", stage: -1, action: "View archive details", description: "This track is archived and is not available in the buyer catalog." }
} as const;

export function getArtistDashboardStatus(status: string) {
  return Object.hasOwn(artistDashboardStatuses, status)
    ? artistDashboardStatuses[status as keyof typeof artistDashboardStatuses]
    : { label: "Status unavailable", stage: -1, action: "View track details", description: "Open this track to check its current details." };
}

// The interactive dashboard needs presentation fields only. Keep private audio,
// rights-holder contact details and moderation metadata on the server.
export function toArtistDashboardTracks(tracks: Track[]) {
  return tracks.slice(0, 5).map(track => ({
    id: track.id,
    slug: track.slug,
    title: track.title,
    status: track.status,
    duration: track.duration_seconds,
    coverUrl: track.cover_art_url ?? null
  }));
}
export type ArtistDashboardTrack = ReturnType<typeof toArtistDashboardTracks>[number];

export function getArtistDashboardSummary(tracks: Pick<Track, "status">[]) {
  return {
    total: tracks.length,
    drafts: tracks.filter(track => track.status === "draft").length,
    inReview: tracks.filter(track => track.status === "pending_review").length,
    live: tracks.filter(track => track.status === "approved").length,
    rejected: tracks.filter(track => track.status === "rejected").length,
    archived: tracks.filter(track => track.status === "archived").length
  };
}
export type ArtistDashboardSummary = ReturnType<typeof getArtistDashboardSummary>;

export function getInitialDashboardTrack(tracks: ArtistDashboardTrack[]) {
  return tracks.find(track => track.status === "draft") ?? tracks[0] ?? null;
}
