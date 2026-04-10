import { favorites as demoFavorites, licenseTypes as demoLicenseTypes, orders as demoOrders, tracks as demoTracks } from "@/lib/demo-data";
import { env, hasSupabaseEnv } from "@/lib/env";
import { getPublicStorageUrl, storageBuckets } from "@/lib/storage";
import { withTrackAudioAccess } from "@/services/storage/server";
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
      `
    )
    .eq("status", "approved")
    .order("featured", { ascending: false })
    .order("created_at", { ascending: false });

  const normalizedTrackRows = (trackRows || []) as any[];
  const artistIds = Array.from(new Set(normalizedTrackRows.map((row) => row.artist_user_id)));
  const trackIds = Array.from(new Set(normalizedTrackRows.map((row) => row.id)));
  const { data: profileRows } = artistIds.length
    ? await supabase.from("artist_profiles").select("user_id, artist_name").in("user_id", artistIds)
    : { data: [] as Array<{ user_id: string; artist_name: string }> };
  const { data: rightsHolderRows } = trackIds.length
    ? await supabase.from("track_rights_holders_public").select("*").in("track_id", trackIds)
    : { data: [] as Array<Record<string, unknown>> };

  const artistNameByUserId = new Map((profileRows || []).map((row) => [row.user_id, row.artist_name]));
  const rightsHoldersByTrackId = groupRightsHoldersByTrackId(rightsHolderRows || []);
  const favoritesByTrackId = buyerUserId ? await getFavoriteTrackIdSet(buyerUserId) : new Set<string>();

  return normalizedTrackRows.map((row) =>
    mapTrack(row, artistNameByUserId.get(row.artist_user_id) || "Artist", rightsHoldersByTrackId.get(row.id) || [], favoritesByTrackId.has(row.id))
  );
}

export async function getBuyerTrackBySlug(slug: string, buyerUserId?: string) {
  const tracks = await getBuyerCatalogTracks(buyerUserId);
  const track = tracks.find((item) => item.slug === slug) || null;
  if (!track || !hasSupabaseEnv || env.demoMode) {
    return track;
  }

  return withTrackAudioAccess(track, "preview");
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
          default_price_cents,
          terms_summary,
          active
        )
      `
    )
    .eq("buyer_user_id", buyerUserId)
    .order("created_at", { ascending: false });

  return ((data || []) as any[]).map((row) => ({
    ...row,
    amount_paid: Number(row.amount_cents || 0) / 100,
    order_status: row.status,
    track: row.tracks || null,
    license_type: row.license_types
      ? {
          ...row.license_types,
          base_price: Number(row.license_types.default_price_cents || 0) / 100
        }
      : null
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
          default_price_cents,
          terms_summary,
          active
        )
      `
    )
    .eq("id", orderId)
    .maybeSingle();

  const row = data as any;
  if (!row) return null;

  return {
    ...row,
    amount_paid: Number(row.amount_cents || 0) / 100,
    order_status: row.status,
    track: row.tracks || null,
    license_type: row.license_types
      ? {
          ...row.license_types,
          base_price: Number(row.license_types.default_price_cents || 0) / 100
        }
      : null
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

function mapTrack(row: any, artistName: string, rightsHolderRows: any[], isFavorite = false): Track & { is_favorite?: boolean } {
  const rightsHolders: RightsHolder[] = rightsHolderRows.map((holder: any) => ({
    id: holder.id,
    track_id: holder.track_id,
    name: holder.name,
    email: holder.email || "",
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
    license_options: licenseOptions,
    is_favorite: isFavorite
  };
}

function groupRightsHoldersByTrackId(rows: any[]) {
  const grouped = new Map<string, any[]>();

  for (const row of rows) {
    const trackId = String(row.track_id || "");
    if (!trackId) continue;
    const current = grouped.get(trackId) || [];
    current.push(row);
    grouped.set(trackId, current);
  }

  return grouped;
}

function enrichOrder(order: Order, track: Pick<Track, "id" | "title" | "slug"> | null, license: LicenseType | null) {
  return {
    ...order,
    track,
    license_type: license
  };
}
