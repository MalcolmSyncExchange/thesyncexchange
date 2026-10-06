import { artistProfiles, tracks as demoTracks } from "@/lib/demo-data";
import { shouldUseDemoData } from "@/lib/env";
import { getPublicStorageUrl, storageBuckets } from "@/lib/storage";
import { reportOperationalError } from "@/lib/monitoring";
import { getDemoArtistProfile } from "@/services/auth/demo-store";
import { requireAccountScope } from "@/services/auth/authorization";
import {
  artistCatalogPageSize,
  normalizeArtistCatalogQuery,
  parseArtistCatalogPage,
  parseArtistCatalogStatus,
  toArtistCatalogTrack,
  toArtistTrackDetail,
  type ArtistCatalogPageData,
  type ArtistCatalogStatusFilter,
  type ArtistTrackBuyerPreviewData
} from "@/services/artist/catalog-contract";
import { artistProfileColumns } from "@/services/artist/profile-contract";
import { toBuyerSafeTrackPreview, toBuyerTrack } from "@/services/buyer/contract";
import type { ArtistPublicProfile, LicenseType, RightsHolder, Track, TrackStatus } from "@/types/models";

interface ArtistWorkspaceData {
  profile: ArtistPublicProfile | null;
  tracks: Track[];
}

interface ArtistCatalogInput {
  query?: string | string[];
  status?: string | string[];
  page?: string | string[];
}

const trackRelations = `
  id,
  artist_user_id,
  title,
  slug,
  description,
  genre,
  subgenre,
  moods,
  bpm,
  musical_key,
  duration_seconds,
  instrumental,
  vocals,
  explicit,
  lyrics,
  release_year,
  cover_art_path,
  audio_file_path,
  preview_file_path,
  waveform_path,
  status,
  featured,
  approved_at,
  approved_by,
  created_at,
  updated_at,
  rights_holders (
    id,
    track_id,
    name,
    email,
    role_type,
    ownership_percent,
    approval_status,
    created_at,
    updated_at
  ),
  track_license_options (
    id,
    track_id,
    license_type_id,
    price_cents,
    active,
    license_types (
      id,
      name,
      slug,
      description,
      exclusive,
      default_price_cents,
      terms_summary,
      active
    )
  )
`;

const trackIndexRelations = `
  id,
  title,
  slug,
  genre,
  status,
  preview_file_path,
  updated_at,
  track_license_options (
    active,
    license_types (active)
  )
`;

export async function getArtistWorkspaceData(userId: string): Promise<ArtistWorkspaceData> {
  if (shouldUseDemoData()) {
    const profile = (await getDemoArtistProfile(userId)) || artistProfiles.find((item) => item.user_id === userId) || null;
    return {
      profile: profile ? mapArtistProfile(profile) : null,
      tracks: demoTracks.filter((track) => track.artist_user_id === userId)
    };
  }

  const { supabase } = await requireAccountScope("artist", userId);
  const { data: profileRow } = await supabase.from("artist_profiles").select(artistProfileColumns).eq("user_id", userId).maybeSingle();
  const { data: trackRows } = await supabase
    .from("tracks")
    .select(trackRelations)
    .eq("artist_user_id", userId)
    .order("created_at", { ascending: false });

  const profile = profileRow ? mapArtistProfile(profileRow) : null;
  const artistName = profile?.artist_name || "Artist";

  return {
    profile,
    tracks: (trackRows || []).map((row) => mapTrack(row, artistName, false))
  };
}

export async function getArtistCatalogPage(userId: string, input: ArtistCatalogInput = {}): Promise<ArtistCatalogPageData> {
  const query = normalizeArtistCatalogQuery(input.query);
  const status = parseArtistCatalogStatus(input.status);
  const requestedPage = parseArtistCatalogPage(input.page);

  if (shouldUseDemoData()) {
    const profile = (await getDemoArtistProfile(userId)) || artistProfiles.find(item => item.user_id === userId) || null;
    const artistName = profile?.artist_name || "Artist";
    const tracks = demoTracks
      .filter(track => track.artist_user_id === userId)
      .map(track => prepareDemoTrack(track, artistName));
    return paginateArtistCatalog(tracks, { query, status, page: requestedPage });
  }

  const { supabase } = await requireAccountScope("artist", userId);
  const [profileResult, indexResult] = await Promise.all([
    supabase.from("artist_profiles").select("artist_name").eq("user_id", userId).maybeSingle(),
    supabase.from("tracks").select(trackIndexRelations).eq("artist_user_id", userId).order("updated_at", { ascending: false })
  ]);

  if (indexResult.error) {
    reportOperationalError("artist_catalog_index_load_failed", indexResult.error, { artistUserId: userId });
    throw new Error("Unable to load your catalog right now.");
  }

  const artistName = String(profileResult.data?.artist_name || "Artist");
  const allIndexRows = (indexResult.data || []) as any[];
  const filteredIndexRows = filterArtistTrackIndex(allIndexRows, query, status);
  const total = filteredIndexRows.length;
  const pageCount = Math.max(1, Math.ceil(total / artistCatalogPageSize));
  const page = Math.min(requestedPage, pageCount);
  const pageRows = filteredIndexRows.slice((page - 1) * artistCatalogPageSize, page * artistCatalogPageSize);
  const pageIds = pageRows.map(row => String(row.id));

  let pageTracks: Track[] = [];
  if (pageIds.length) {
    const pageResult = await supabase.from("tracks").select(trackRelations).eq("artist_user_id", userId).in("id", pageIds);
    if (pageResult.error) {
      reportOperationalError("artist_catalog_page_load_failed", pageResult.error, { artistUserId: userId, page });
      throw new Error("Unable to load your catalog right now.");
    }
    const order = new Map(pageIds.map((id, index) => [id, index]));
    pageTracks = (pageResult.data || [])
      .map(row => mapTrack(row, artistName, true))
      .sort((left, right) => (order.get(left.id) || 0) - (order.get(right.id) || 0));
  }

  return {
    items: pageTracks.map(toArtistCatalogTrack),
    page,
    pageSize: artistCatalogPageSize,
    total,
    pageCount,
    query,
    status,
    counts: getArtistCatalogCounts(allIndexRows)
  };
}

export async function getArtistTrackDetail(userId: string, slug: string) {
  const track = await getAuthorizedArtistTrack(userId, slug, true);
  return track ? toArtistTrackDetail(track) : null;
}

export async function getArtistTrackBuyerPreview(userId: string, slug: string): Promise<ArtistTrackBuyerPreviewData | null> {
  const track = await getAuthorizedArtistTrack(userId, slug, true);
  if (!track) return null;
  const detail = toArtistTrackDetail(track);
  const buyerTrack = { ...toBuyerTrack(track), audio_file_url: track.audio_file_url };
  return {
    track: toBuyerSafeTrackPreview(buyerTrack),
    buyerVisibility: detail.buyerVisibility
  };
}

export async function getArtistTrackBySlug(userId: string, slug: string) {
  return getAuthorizedArtistTrack(userId, slug, false);
}

async function getAuthorizedArtistTrack(userId: string, slug: string, includePreview: boolean) {
  if (shouldUseDemoData()) {
    const profile = (await getDemoArtistProfile(userId)) || artistProfiles.find(item => item.user_id === userId) || null;
    const track = demoTracks.find(item => item.artist_user_id === userId && item.slug === slug) || null;
    return track ? prepareDemoTrack(track, profile?.artist_name || track.artist_name, includePreview) : null;
  }

  const { supabase } = await requireAccountScope("artist", userId);
  const [profileResult, trackResult] = await Promise.all([
    supabase.from("artist_profiles").select("artist_name").eq("user_id", userId).maybeSingle(),
    supabase.from("tracks").select(trackRelations).eq("artist_user_id", userId).eq("slug", slug).maybeSingle()
  ]);

  if (trackResult.error) {
    reportOperationalError("artist_track_load_failed", trackResult.error, { artistUserId: userId, slug });
    throw new Error("Unable to load this track right now.");
  }

  if (!trackResult.data) return null;
  return mapTrack(trackResult.data, String(profileResult.data?.artist_name || "Artist"), includePreview);
}

function paginateArtistCatalog(tracks: Track[], { query, status, page: requestedPage }: { query: string; status: ArtistCatalogStatusFilter; page: number }): ArtistCatalogPageData {
  const summaries = tracks.map(toArtistCatalogTrack);
  const filtered = summaries.filter(item => matchesArtistCatalogSearch(item, query) && matchesArtistCatalogStatus(item, status));
  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / artistCatalogPageSize));
  const page = Math.min(requestedPage, pageCount);
  return {
    items: filtered.slice((page - 1) * artistCatalogPageSize, page * artistCatalogPageSize),
    page,
    pageSize: artistCatalogPageSize,
    total,
    pageCount,
    query,
    status,
    counts: {
      total: summaries.length,
      discoverable: summaries.filter(item => item.buyerVisibility.eligible).length,
      inReview: summaries.filter(item => item.status === "pending_review").length,
      drafts: summaries.filter(item => item.status === "draft").length,
      needsAttention: summaries.filter(item => item.status === "rejected" || item.buyerVisibility.label === "Needs attention").length
    }
  };
}

function filterArtistTrackIndex(rows: any[], query: string, status: ArtistCatalogStatusFilter) {
  return rows.filter(row => {
    const activeLicenseCount = getActiveLicenseCount(row.track_license_options || []);
    const eligible = row.status === "approved" && Boolean(row.preview_file_path) && activeLicenseCount > 0;
    const queryMatches = !query || [row.title, row.slug, row.genre].some(value => String(value || "").toLocaleLowerCase().includes(query.toLocaleLowerCase()));
    if (!queryMatches) return false;
    if (status === "discoverable") return eligible;
    if (status === "in_review") return row.status === "pending_review";
    if (status === "draft") return row.status === "draft";
    if (status === "needs_attention") return row.status === "rejected" || (row.status === "approved" && !eligible);
    return true;
  });
}

function getArtistCatalogCounts(rows: any[]) {
  const index = rows.map(row => ({
    status: row.status as TrackStatus,
    eligible: row.status === "approved" && Boolean(row.preview_file_path) && getActiveLicenseCount(row.track_license_options || []) > 0
  }));
  return {
    total: index.length,
    discoverable: index.filter(item => item.eligible).length,
    inReview: index.filter(item => item.status === "pending_review").length,
    drafts: index.filter(item => item.status === "draft").length,
    needsAttention: index.filter(item => item.status === "rejected" || (item.status === "approved" && !item.eligible)).length
  };
}

function getActiveLicenseCount(options: any[]) {
  return options.filter(option => option.active !== false && option.license_types?.active !== false).length;
}

function matchesArtistCatalogSearch(item: ReturnType<typeof toArtistCatalogTrack>, query: string) {
  if (!query) return true;
  const normalized = query.toLocaleLowerCase();
  return [item.title, item.slug, item.genre, item.subgenre].some(value => value.toLocaleLowerCase().includes(normalized));
}

function matchesArtistCatalogStatus(item: ReturnType<typeof toArtistCatalogTrack>, status: ArtistCatalogStatusFilter) {
  if (status === "discoverable") return item.buyerVisibility.eligible;
  if (status === "in_review") return item.status === "pending_review";
  if (status === "draft") return item.status === "draft";
  if (status === "needs_attention") return item.status === "rejected" || item.buyerVisibility.label === "Needs attention";
  return true;
}

function prepareDemoTrack(track: Track, artistName: string, includePreview = true): Track {
  return {
    ...track,
    artist_name: artistName,
    audio_file_url: includePreview ? track.audio_file_url || null : null
  };
}

function mapArtistProfile(row: any): ArtistPublicProfile {
  return {
    id: row.id,
    user_id: row.user_id,
    artist_name: row.artist_name,
    bio: row.bio || "",
    location: row.location || "",
    website: row.website,
    instagram_url: row.instagram_url || row.social_links?.instagram || null,
    spotify_url: row.spotify_url || row.social_links?.spotify || null,
    youtube_url: row.youtube_url || row.social_links?.youtube || null,
    social_links: row.social_links || {},
    default_licensing_preferences: row.default_licensing_preferences,
    verification_status: row.verification_status,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function mapTrack(row: any, artistName: string, includePreview: boolean): Track {
  const rightsHolders: RightsHolder[] = (row.rights_holders || []).map((holder: any) => ({
    id: holder.id,
    track_id: holder.track_id,
    name: holder.name,
    email: holder.email,
    role_type: holder.role_type,
    ownership_percent: Number(holder.ownership_percent),
    approval_status: holder.approval_status,
    created_at: holder.created_at,
    updated_at: holder.updated_at
  }));

  const licenseOptions = (row.track_license_options || [])
    .filter((option: any) => option.active !== false && option.license_types?.active !== false)
    .map((option: any) => {
      const license = option.license_types as LicenseType;
      return {
        ...license,
        base_price: Number((option.license_types as any).default_price_cents || 0) / 100,
        price_override: option.price_cents == null ? null : Number(option.price_cents) / 100
      };
    });

  return {
    id: row.id,
    artist_user_id: row.artist_user_id,
    artist_name: artistName,
    title: row.title,
    slug: row.slug,
    description: row.description || "",
    genre: row.genre,
    subgenre: row.subgenre,
    mood: row.moods || [],
    bpm: row.bpm,
    key: row.musical_key,
    duration_seconds: row.duration_seconds,
    instrumental: row.instrumental,
    vocals: row.vocals,
    explicit: row.explicit,
    lyrics: row.lyrics,
    release_year: row.release_year,
    cover_art_path: row.cover_art_path,
    audio_file_path: row.audio_file_path,
    preview_file_path: row.preview_file_path,
    waveform_path: row.waveform_path,
    waveform_preview_url: getPublicStorageUrl(storageBuckets.trackPreviews, row.waveform_path),
    audio_file_url: includePreview ? getPublicStorageUrl(storageBuckets.trackPreviews, row.preview_file_path) : null,
    cover_art_url: getPublicStorageUrl(storageBuckets.coverArt, row.cover_art_path),
    status: row.status as TrackStatus,
    featured: row.featured,
    approved_at: row.approved_at,
    approved_by: row.approved_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    rights_holders: rightsHolders,
    license_options: licenseOptions
  };
}
