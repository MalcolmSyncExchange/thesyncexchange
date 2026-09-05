import { artistProfiles, tracks as demoTracks } from "@/lib/demo-data";
import { env, hasSupabaseEnv } from "@/lib/env";
import { getPublicStorageUrl, storageBuckets } from "@/lib/storage";
import { getDemoArtistProfile } from "@/services/auth/demo-store";
import { withTrackAudioAccess } from "@/services/storage/server";
import { createServerSupabaseClient } from "@/services/supabase/server";
import type { ArtistProfile, LicenseType, RightsHolder, Track, TrackStatus } from "@/types/models";

interface ArtistWorkspaceData {
  profile: ArtistProfile | null;
  tracks: Track[];
}

export interface ArtistCatalogDiagnosticResult {
  authenticatedUserId: string;
  clientMode: "demo" | "authenticated-ssr";
  tracksOnly: DiagnosticReadResult;
  rightsHoldersOnly: DiagnosticReadResult;
  trackLicenseOptionsOnly: DiagnosticReadResult;
  licenseTypesOnly: DiagnosticReadResult;
  fullNestedCatalogQuery: DiagnosticReadResult;
}

interface DiagnosticReadResult {
  ok: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  errorDetails: string | null;
  errorHint: string | null;
  rawTrackCount?: number;
  rowCount?: number;
  trackIds?: string[];
  slugs?: string[];
  statuses?: string[];
  artistUserIds?: string[];
  rightsHolderCountByTrackId?: Record<string, number>;
  licenseOptionCountByTrackId?: Record<string, number>;
  licenseTypeIds?: string[];
}

const artistCatalogTrackSelect = `
  *,
  rights_holders (*),
  track_license_options (
    id,
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

export async function getArtistWorkspaceData(userId: string): Promise<ArtistWorkspaceData> {
  if (!hasSupabaseEnv || env.demoMode) {
    const profile = getDemoArtistProfile(userId) || artistProfiles.find((item) => item.user_id === userId) || null;
    return {
      profile,
      tracks: demoTracks.filter((track) => track.artist_user_id === userId)
    };
  }

  const supabase = createServerSupabaseClient();
  const { data: profileRow, error: profileError } = await supabase.from("artist_profiles").select("*").eq("user_id", userId).maybeSingle();
  if (profileError) {
    logArtistCatalogReadError("artist_profile_read_failed", userId, profileError);
  }

  const { data: trackRows, error: trackError } = await supabase
    .from("tracks")
    .select(artistCatalogTrackSelect)
    .eq("artist_user_id", userId)
    .order("created_at", { ascending: false });
  if (trackError) {
    logArtistCatalogReadError("artist_tracks_read_failed", userId, trackError);
  }

  const profile = profileRow ? mapArtistProfile(profileRow) : null;
  const artistName = profile?.artist_name || "Artist";

  return {
    profile,
    tracks: (trackRows || []).map((row) => mapTrack(row, artistName))
  };
}

export async function getArtistTrackBySlug(userId: string, slug: string) {
  const { tracks } = await getArtistWorkspaceData(userId);
  const track = tracks.find((item) => item.slug === slug) || null;
  if (!track || !hasSupabaseEnv || env.demoMode) {
    return track;
  }

  return withTrackAudioAccess(track, "full");
}

export async function getArtistCatalogDiagnostics(userId: string): Promise<ArtistCatalogDiagnosticResult> {
  if (!hasSupabaseEnv || env.demoMode) {
    const demoRows = demoTracks.filter((track) => track.artist_user_id === userId);
    const demoResult = makeDiagnosticSuccess(demoRows);
    return {
      authenticatedUserId: userId,
      clientMode: "demo",
      tracksOnly: demoResult,
      rightsHoldersOnly: makeDiagnosticSuccess([]),
      trackLicenseOptionsOnly: makeDiagnosticSuccess([]),
      licenseTypesOnly: makeDiagnosticSuccess([]),
      fullNestedCatalogQuery: demoResult
    };
  }

  const supabase = createServerSupabaseClient();

  const tracksOnlyResult = await supabase
    .from("tracks")
    .select("id, slug, status, artist_user_id")
    .eq("artist_user_id", userId)
    .order("created_at", { ascending: false });
  const trackIds = (tracksOnlyResult.data || []).map((track) => track.id).filter(Boolean);

  const rightsHoldersResult = trackIds.length
    ? await supabase.from("rights_holders").select("id, track_id").in("track_id", trackIds)
    : { data: [], error: null };
  const trackLicenseOptionsResult = trackIds.length
    ? await supabase.from("track_license_options").select("id, track_id, license_type_id").in("track_id", trackIds)
    : { data: [], error: null };
  const licenseTypeIds = Array.from(
    new Set((trackLicenseOptionsResult.data || []).map((option) => option.license_type_id).filter(Boolean))
  );
  const licenseTypesResult = licenseTypeIds.length
    ? await supabase.from("license_types").select("id, slug, active").in("id", licenseTypeIds)
    : { data: [], error: null };
  const fullNestedResult = await supabase
    .from("tracks")
    .select(artistCatalogTrackSelect)
    .eq("artist_user_id", userId)
    .order("created_at", { ascending: false });

  return {
    authenticatedUserId: userId,
    clientMode: "authenticated-ssr",
    tracksOnly: makeDiagnosticResult(tracksOnlyResult, "tracks"),
    rightsHoldersOnly: makeDiagnosticResult(rightsHoldersResult, "rights_holders"),
    trackLicenseOptionsOnly: makeDiagnosticResult(trackLicenseOptionsResult, "track_license_options"),
    licenseTypesOnly: makeDiagnosticResult(licenseTypesResult, "license_types"),
    fullNestedCatalogQuery: makeDiagnosticResult(fullNestedResult, "tracks")
  };
}

function mapArtistProfile(row: any): ArtistProfile {
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
    payout_email: row.payout_email,
    default_licensing_preferences: row.default_licensing_preferences,
    verification_status: row.verification_status,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function mapTrack(row: any, artistName: string): Track {
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
    .filter((option: any) => option.license_types)
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
    audio_file_url: null,
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

function makeDiagnosticResult(result: { data: any[] | null; error: any }, tableName: string): DiagnosticReadResult {
  if (result.error) {
    return {
      ok: false,
      errorCode: result.error.code || null,
      errorMessage: result.error.message || null,
      errorDetails: result.error.details || null,
      errorHint: result.error.hint || null,
      rowCount: 0,
      rawTrackCount: tableName === "tracks" ? 0 : undefined,
      trackIds: [],
      slugs: [],
      statuses: [],
      artistUserIds: []
    };
  }

  return makeDiagnosticSuccess(result.data || [], tableName);
}

function makeDiagnosticSuccess(rows: any[], tableName = ""): DiagnosticReadResult {
  return {
    ok: true,
    errorCode: null,
    errorMessage: null,
    errorDetails: null,
    errorHint: null,
    rowCount: rows.length,
    rawTrackCount: tableName === "tracks" ? rows.length : undefined,
    trackIds: Array.from(new Set(rows.map((row) => row.id || row.track_id).filter(Boolean))),
    slugs: Array.from(new Set(rows.map((row) => row.slug).filter(Boolean))),
    statuses: Array.from(new Set(rows.map((row) => row.status).filter(Boolean))),
    artistUserIds: Array.from(new Set(rows.map((row) => row.artist_user_id).filter(Boolean))),
    rightsHolderCountByTrackId: countRowsByTrackId(rows, "rights_holders"),
    licenseOptionCountByTrackId: countRowsByTrackId(rows, "track_license_options"),
    licenseTypeIds: Array.from(new Set(rows.map((row) => row.license_type_id || row.license_types?.id).filter(Boolean)))
  };
}

function countRowsByTrackId(rows: any[], relationName: "rights_holders" | "track_license_options") {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    if (!row.id || !Array.isArray(row[relationName])) continue;
    counts[row.id] = row[relationName].length;
  }
  return counts;
}

function logArtistCatalogReadError(label: string, userId: string, error: any) {
  console.error(`[artist catalog] ${label}`, {
    userId,
    code: error?.code || null,
    message: error?.message || null,
    details: error?.details || null,
    hint: error?.hint || null
  });
}
