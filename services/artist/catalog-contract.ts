import { getBuyerCatalogEligibility, type BuyerCatalogEligibility } from "@/lib/buyer-catalog-eligibility";
import type { BuyerSafeTrackPreview } from "@/services/buyer/contract";
import type { LicenseType, Track, TrackStatus } from "@/types/models";

export const artistCatalogPageSize = 12;

export type ArtistCatalogStatusFilter = "all" | "discoverable" | "in_review" | "draft" | "needs_attention";

export interface ArtistPreviewTrack {
  id: string;
  slug: string;
  title: string;
  artistName: string;
  artworkUrl: string | null;
  previewUrl: string;
  waveformUrl: string | null;
  durationSeconds: number;
}

export interface ArtistTrackAssetSummary {
  fullMasterStored: boolean;
  buyerPreviewReady: boolean;
  artworkReady: boolean;
  waveformReady: boolean;
  availableCount: number;
  trackedCount: 4;
}

export interface ArtistLegacyRightsSummary {
  holderCount: number;
  recordedPercent: number;
  pendingCount: number;
  explanation: string;
}

export interface ArtistCatalogTrack {
  id: string;
  slug: string;
  title: string;
  artistName: string;
  genre: string;
  subgenre: string;
  durationSeconds: number;
  coverArtUrl: string | null;
  status: TrackStatus;
  statusLabel: string;
  buyerVisibility: BuyerCatalogEligibility;
  assets: ArtistTrackAssetSummary;
  legacyRights: ArtistLegacyRightsSummary;
  activeLicenseCount: number;
  updatedAt: string;
  preview: ArtistPreviewTrack | null;
}

export interface ArtistCatalogPageData {
  items: ArtistCatalogTrack[];
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
  query: string;
  status: ArtistCatalogStatusFilter;
  counts: {
    total: number;
    discoverable: number;
    inReview: number;
    drafts: number;
    needsAttention: number;
  };
}

export interface ArtistTrackDetail extends ArtistCatalogTrack {
  description: string;
  moods: string[];
  bpm: number;
  musicalKey: string;
  instrumental: boolean;
  vocals: boolean;
  explicit: boolean;
  releaseYear: number;
  createdAt: string;
  rightsCredits: Array<{
    id: string;
    name: string;
    role: string;
    percentage: number;
    reviewState: "pending" | "approved" | "rejected";
  }>;
  licenseOptions: Array<LicenseType & { price_override?: number | null }>;
}

export interface ArtistTrackBuyerPreviewData {
  track: BuyerSafeTrackPreview;
  buyerVisibility: BuyerCatalogEligibility;
}

export function parseArtistCatalogStatus(value?: string | string[]): ArtistCatalogStatusFilter {
  const normalized = Array.isArray(value) ? value[0] : value;
  if (normalized === "discoverable" || normalized === "in_review" || normalized === "draft" || normalized === "needs_attention") return normalized;
  return "all";
}

export function parseArtistCatalogPage(value?: string | string[]) {
  const normalized = Array.isArray(value) ? value[0] : value;
  const page = Number.parseInt(normalized || "1", 10);
  return Number.isFinite(page) && page > 0 ? Math.min(page, 10_000) : 1;
}

export function normalizeArtistCatalogQuery(value?: string | string[]) {
  const normalized = (Array.isArray(value) ? value[0] : value) || "";
  return normalized.replace(/[^\p{L}\p{N}\s'’-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

export function toArtistCatalogTrack(track: Track): ArtistCatalogTrack {
  const activeLicenseCount = track.license_options.filter(option => option.active !== false).length;
  const buyerVisibility = getBuyerCatalogEligibility({
    status: track.status,
    previewAvailable: Boolean(track.audio_file_url),
    activeLicenseCount
  });
  const assets: ArtistTrackAssetSummary = {
    fullMasterStored: Boolean(track.audio_file_path),
    buyerPreviewReady: Boolean(track.audio_file_url),
    artworkReady: Boolean(track.cover_art_url),
    waveformReady: Boolean(track.waveform_preview_url),
    availableCount: [track.audio_file_path, track.audio_file_url, track.cover_art_url, track.waveform_preview_url].filter(Boolean).length,
    trackedCount: 4
  };
  const recordedPercent = track.rights_holders.reduce((sum, holder) => sum + Number(holder.ownership_percent || 0), 0);
  const pendingCount = track.rights_holders.filter(holder => holder.approval_status !== "approved").length;
  const legacyRights: ArtistLegacyRightsSummary = {
    holderCount: track.rights_holders.length,
    recordedPercent,
    pendingCount,
    explanation: "Current records do not yet separate Recording and Composition rights."
  };
  const preview = track.audio_file_url ? {
    id: track.id,
    slug: track.slug,
    title: track.title,
    artistName: track.artist_name,
    artworkUrl: track.cover_art_url || null,
    previewUrl: track.audio_file_url,
    waveformUrl: track.waveform_preview_url || null,
    durationSeconds: track.duration_seconds
  } satisfies ArtistPreviewTrack : null;

  return {
    id: track.id,
    slug: track.slug,
    title: track.title,
    artistName: track.artist_name,
    genre: track.genre,
    subgenre: track.subgenre,
    durationSeconds: track.duration_seconds,
    coverArtUrl: track.cover_art_url || null,
    status: track.status,
    statusLabel: getTrackStatusLabel(track.status),
    buyerVisibility,
    assets,
    legacyRights,
    activeLicenseCount,
    updatedAt: track.updated_at,
    preview
  };
}

export function toArtistTrackDetail(track: Track): ArtistTrackDetail {
  return {
    ...toArtistCatalogTrack(track),
    description: track.description,
    moods: track.mood,
    bpm: track.bpm,
    musicalKey: track.key,
    instrumental: track.instrumental,
    vocals: track.vocals,
    explicit: track.explicit,
    releaseYear: track.release_year,
    createdAt: track.created_at,
    rightsCredits: track.rights_holders.map(holder => ({
      id: holder.id,
      name: holder.name,
      role: holder.role_type,
      percentage: Number(holder.ownership_percent),
      reviewState: holder.approval_status
    })),
    licenseOptions: track.license_options.filter(option => option.active !== false)
  };
}

function getTrackStatusLabel(status: TrackStatus) {
  if (status === "pending_review") return "In review";
  if (status === "rejected") return "Changes requested";
  if (status === "approved") return "Approved";
  if (status === "archived") return "Archived";
  return "Draft";
}
