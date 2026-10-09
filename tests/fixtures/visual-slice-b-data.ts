import { getBuyerCatalogEligibility } from "@/lib/buyer-catalog-eligibility";
import type { ArtistCatalogPageData, ArtistTrackDetail } from "@/services/artist/catalog-contract";
import type { TrackStatus } from "@/types/models";

// Fictional, local-only presentation data. Never imported by a production route.
const statuses: Record<TrackStatus, string> = {
  approved: "Approved", draft: "Draft", pending_review: "In review", rejected: "Changes requested", archived: "Archived"
};
const artwork = "/visual-slice-b-fixture-local/midnight-run.png";

function makeTrack(id: string, status: TrackStatus, overrides: Partial<ArtistTrackDetail> = {}): ArtistTrackDetail {
  const previewReady = status === "approved" && id !== "approved-needs-attention";
  const licenseCount = status === "approved" && id !== "approved-needs-attention" ? 1 : 0;
  const title = id === "long-title"
    ? "An Exceptionally Long Fictional Track Title for a Narrow Catalog Screen and a Second Line of Text"
    : id === "approved-needs-attention" ? "Quiet Current"
    : id === "minimal" ? "Untitled Idea"
    : { approved: "Midnight Run", draft: "First Light", pending_review: "Glasshouse", rejected: "Open Water", archived: "Still Here" }[status];
  return {
    id,
    slug: id,
    title,
    artistName: id === "long-title" ? "The Very Long Fictional Artist Name and Collective" : "Maya Sol",
    genre: id === "minimal" ? "" : "Electronic",
    subgenre: id === "minimal" ? "" : "Downtempo",
    durationSeconds: id === "minimal" ? 0 : 226,
    coverArtUrl: status === "approved" && id !== "approved-needs-attention" ? artwork : null,
    status,
    statusLabel: statuses[status],
    buyerVisibility: getBuyerCatalogEligibility({ status, previewAvailable: previewReady, activeLicenseCount: licenseCount }),
    assets: {
      fullMasterStored: status !== "draft",
      buyerPreviewReady: previewReady,
      artworkReady: status === "approved" && id !== "approved-needs-attention",
      waveformReady: false,
      availableCount: status === "approved" && id !== "approved-needs-attention" ? 3 : status === "draft" ? 0 : 1,
      trackedCount: 4
    },
    legacyRights: { holderCount: 0, recordedPercent: 0, pendingCount: 0, explanation: "Current records do not yet separate Recording and Composition rights." },
    activeLicenseCount: licenseCount,
    updatedAt: "2026-10-08T18:30:00.000Z",
    preview: previewReady ? { id, slug: id, title, artistName: "Maya Sol", artworkUrl: artwork, previewUrl: "/demo/audio-preview.wav", waveformUrl: null, durationSeconds: 226 } : null,
    description: id === "minimal" ? "" : "A cinematic electronic track for a fictional review scenario.",
    moods: id === "minimal" ? [] : ["Focused", "Warm"],
    bpm: id === "minimal" ? 0 : 108,
    musicalKey: id === "minimal" ? "" : "A minor",
    instrumental: true,
    vocals: false,
    explicit: false,
    releaseYear: id === "minimal" ? 0 : 2026,
    createdAt: "2026-10-01T18:30:00.000Z",
    rightsCredits: [],
    licenseOptions: licenseCount ? [{ id: "fictional-license", name: "Fictional Standard License with a Deliberately Long Label", slug: "fictional-standard", description: "Fictional review option", exclusive: false, base_price: 9900, terms_summary: "Prototype-only terms summary for layout review.", active: true }] : [],
    ...overrides
  };
}

export const sliceBTracks = [
  makeTrack("approved", "approved"),
  makeTrack("long-title", "approved"),
  makeTrack("draft", "draft"),
  makeTrack("pending", "pending_review"),
  makeTrack("rejected", "rejected"),
  makeTrack("archived", "archived"),
  makeTrack("approved-needs-attention", "approved"),
  makeTrack("minimal", "draft")
];

export function sliceBCatalogData(mode: "populated" | "empty" | "filtered-empty" = "populated"): ArtistCatalogPageData {
  const items = mode === "populated" ? sliceBTracks : [];
  return {
    items, page: 1, pageSize: 12, total: items.length, pageCount: 1,
    query: mode === "filtered-empty" ? "no such track" : "",
    status: "all",
    counts: mode === "empty"
      ? { total: 0, discoverable: 0, inReview: 0, drafts: 0, needsAttention: 0 }
      : { total: sliceBTracks.length, discoverable: 2, inReview: 1, drafts: 2, needsAttention: 2 }
  };
}

export function sliceBTrack(id: string) {
  return sliceBTracks.find(track => track.id === id) || sliceBTracks[0];
}
