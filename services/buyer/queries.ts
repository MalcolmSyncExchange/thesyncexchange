import { favorites as demoFavorites, licenseTypes as demoLicenseTypes, orders as demoOrders, tracks as demoTracks } from "@/lib/demo-data";
import { env, hasSupabaseEnv } from "@/lib/env";
import { createServerSupabaseClient } from "@/services/supabase/server";
import type { LicenseType, Order, RightsHolder, Track, TrackStatus } from "@/types/models";

export async function getBuyerCatalogTracks(buyerUserId?: string): Promise<Track[]> {
  if (!hasSupabaseEnv || env.demoMode) {
    const favoriteTrackIds = new Set(
      demoFavorites.filter((favorite) => !buyerUserId || favorite.buyer_user_id === buyerUserId).map((favorite) => favorite.track_id)
    );
    return demoTracks.filter((track) => track.status === "approved").map((track) => ({
      ...track,
      is_favorite: favoriteTrackIds.has(track.id)
    }));
  }

  const supabase = createServerSupabaseClient();
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
    .eq("status", "approved")
    .order("featured", { ascending: false })
    .order("created_at", { ascending: false });

  const artistIds = Array.from(new Set((trackRows || []).map((row) => row.artist_user_id)));
  const { data: profileRows } = artistIds.length
    ? await supabase.from("artist_profiles").select("user_id, artist_name").in("user_id", artistIds)
    : { data: [] as Array<{ user_id: string; artist_name: string }> };

  const artistNameByUserId = new Map((profileRows || []).map((row) => [row.user_id, row.artist_name]));
  const favoritesByTrackId = buyerUserId ? await getFavoriteTrackIdSet(buyerUserId) : new Set<string>();

  return (trackRows || []).map((row) =>
    mapTrack(row, artistNameByUserId.get(row.artist_user_id) || "Artist", favoritesByTrackId.has(row.id))
  );
}

export async function getBuyerTrackBySlug(slug: string, buyerUserId?: string) {
  const tracks = await getBuyerCatalogTracks(buyerUserId);
  return tracks.find((track) => track.slug === slug) || null;
}

export async function getBuyerFavorites(buyerUserId: string) {
  if (!hasSupabaseEnv || env.demoMode) {
    const favoriteTrackIds = new Set(demoFavorites.filter((favorite) => favorite.buyer_user_id === buyerUserId).map((favorite) => favorite.track_id));
    return demoTracks
      .filter((track) => favoriteTrackIds.has(track.id) && track.status === "approved")
      .map((track) => ({ ...track, is_favorite: true }));
  }

  const tracks = await getBuyerCatalogTracks(buyerUserId);
  return tracks.filter((track) => track.is_favorite);
}

export async function getBuyerOrders(buyerUserId: string) {
  if (!hasSupabaseEnv || env.demoMode) {
    return demoOrders
      .filter((order) => order.buyer_user_id === buyerUserId)
      .map((order) => enrichOrder(order, demoTracks.find((track) => track.id === order.track_id) || null, demoLicenseTypes.find((license) => license.id === order.license_type_id) || null));
  }

  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from("orders")
    .select(
      `
        *,
        tracks (
          id,
          title,
          slug
        ),
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
      `
    )
    .eq("buyer_user_id", buyerUserId)
    .order("created_at", { ascending: false });

  return (data || []).map((row: any) => ({
    ...row,
    track: row.tracks || null,
    license_type: row.license_types || null
  }));
}

export async function getBuyerDashboardData(buyerUserId: string) {
  const [catalog, favorites, orders] = await Promise.all([
    getBuyerCatalogTracks(buyerUserId),
    getBuyerFavorites(buyerUserId),
    getBuyerOrders(buyerUserId)
  ]);

  return {
    favorites,
    orders,
    recentlyViewed: catalog.slice(0, 3)
  };
}

export async function getOrderById(orderId: string) {
  if (!hasSupabaseEnv || env.demoMode) {
    const order = demoOrders.find((item) => item.id === orderId);
    if (!order) return null;
    return enrichOrder(order, demoTracks.find((track) => track.id === order.track_id) || null, demoLicenseTypes.find((license) => license.id === order.license_type_id) || null);
  }

  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from("orders")
    .select(
      `
        *,
        tracks (
          id,
          title,
          slug
        ),
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
      `
    )
    .eq("id", orderId)
    .maybeSingle();

  if (!data) return null;

  return {
    ...data,
    track: (data as any).tracks || null,
    license_type: (data as any).license_types || null
  };
}

async function getFavoriteTrackIdSet(buyerUserId: string) {
  if (!hasSupabaseEnv || env.demoMode) {
    return new Set(demoFavorites.filter((favorite) => favorite.buyer_user_id === buyerUserId).map((favorite) => favorite.track_id));
  }

  const supabase = createServerSupabaseClient();
  const { data } = await supabase.from("favorites").select("track_id").eq("buyer_user_id", buyerUserId);
  return new Set((data || []).map((favorite: { track_id: string }) => favorite.track_id));
}

function mapTrack(row: any, artistName: string, isFavorite = false): Track & { is_favorite?: boolean } {
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
    license_options: licenseOptions,
    is_favorite: isFavorite
  };
}

function enrichOrder(order: Order, track: Pick<Track, "id" | "title" | "slug"> | null, license: LicenseType | null) {
  return {
    ...order,
    track,
    license_type: license
  };
}
