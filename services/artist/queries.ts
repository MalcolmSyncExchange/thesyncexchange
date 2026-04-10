import { artistProfiles, tracks as demoTracks } from "@/lib/demo-data";
import { env, hasSupabaseEnv } from "@/lib/env";
import { getDemoArtistProfile } from "@/services/auth/demo-store";
import { createServerSupabaseClient } from "@/services/supabase/server";
import type { ArtistProfile, LicenseType, RightsHolder, Track, TrackStatus } from "@/types/models";

interface ArtistWorkspaceData {
  profile: ArtistProfile | null;
  tracks: Track[];
}

export async function getArtistWorkspaceData(userId: string): Promise<ArtistWorkspaceData> {
  if (!hasSupabaseEnv || env.demoMode) {
    const profile = getDemoArtistProfile(userId) || artistProfiles.find((item) => item.user_id === userId) || null;
    return {
      profile,
      tracks: demoTracks.filter((track) => track.artist_user_id === userId)
    };
  }

  const supabase = createServerSupabaseClient();
  const { data: profileRow } = await supabase.from("artist_profiles").select("*").eq("user_id", userId).maybeSingle();

  const { data: trackRows } = await supabase
    .from("tracks")
    .select(
      `
        *,
        rights_holders (*),
        track_license_options (
          id,
          price_override,
          active,
          license_types (
            id,
            name,
            slug,
            description,
            exclusive,
            base_price,
            terms_summary,
            active
          )
        )
      `
    )
    .eq("artist_user_id", userId)
    .order("created_at", { ascending: false });

  const profile = profileRow ? mapArtistProfile(profileRow) : null;
  const artistName = profile?.artist_name || "Artist";

  return {
    profile,
    tracks: (trackRows || []).map((row) => mapTrack(row, artistName))
  };
}

export async function getArtistTrackBySlug(userId: string, slug: string) {
  const { tracks } = await getArtistWorkspaceData(userId);
  return tracks.find((track) => track.slug === slug) || null;
}

function mapArtistProfile(row: any): ArtistProfile {
  return {
    id: row.id,
    user_id: row.user_id,
    artist_name: row.artist_name,
    bio: row.bio || "",
    location: row.location || "",
    website: row.website,
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
        price_override: option.price_override
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
    mood: row.mood || [],
    bpm: row.bpm,
    key: row.key,
    duration_seconds: row.duration_seconds,
    instrumental: row.instrumental,
    vocals: row.vocals,
    explicit: row.explicit,
    lyrics: row.lyrics,
    release_year: row.release_year,
    waveform_preview_url: row.waveform_preview_url,
    audio_file_url: row.audio_file_url,
    cover_art_url: row.cover_art_url,
    status: row.status as TrackStatus,
    featured: row.featured,
    created_at: row.created_at,
    updated_at: row.updated_at,
    rights_holders: rightsHolders,
    license_options: licenseOptions
  };
}
