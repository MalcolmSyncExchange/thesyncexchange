import "server-only";

import {
  presentPurchase,
  type LicenseFacts,
  type OrderFacts,
  type Purchase,
  type PurchasePage,
} from "@/lib/purchases/contract";
import {
  ORDER_UUID,
  parsePurchaseOptions,
  purchaseCursor,
} from "@/lib/purchases/pagination";
import { shouldUseDemoData } from "@/lib/env";
import {
  orders as demoOrders,
  tracks as demoTracks,
  licenseTypes as demoLicenses,
} from "@/lib/demo-data";
import { getPublicStorageUrl, storageBuckets } from "@/lib/storage";
import { requireSession } from "@/services/auth/session";
import { selectUserProfileCompat } from "@/services/auth/user-profiles";
import { createServerSupabaseClient } from "@/services/supabase/server";
import { createPrivilegedSupabaseClient } from "@/services/supabase/privileged";

const ORDER_FIELDS =
  "id,buyer_user_id,track_id,license_type_id,status,created_at,paid_at,refunded_at,checkout_created_at,amount_cents,currency,agreement_generation_error";
const LICENSE_FIELDS =
  "order_id,buyer_id,track_id,license_type_id,status,generated_at,pdf_storage_path,generation_error,agreement_number,terms_snapshot_json";

async function buyerContext() {
  if (shouldUseDemoData())
    return { user: await requireSession("buyer"), client: null };
  const client = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) throw new Error("Buyer access required.");
  const profile = await selectUserProfileCompat(client, user.id);
  if (profile.error || profile.data?.role !== "buyer")
    throw new Error("Buyer access required.");
  return { user, client };
}

async function presentOwned(
  buyerId: string,
  scoped: OrderFacts[],
): Promise<Purchase[]> {
  if (!scoped.length) return [];
  // The authenticated query has established ownership for every ID before privileged access.
  const privileged = await createPrivilegedSupabaseClient();
  const result = await privileged
    .from("orders")
    .select(ORDER_FIELDS)
    .eq("buyer_user_id", buyerId)
    .in(
      "id",
      scoped.map((o) => o.id),
    );
  if (result.error) throw new Error("Unable to load purchases.");
  const rows = (result.data || []) as OrderFacts[];
  if (
    rows.some(
      (row) =>
        row.buyer_user_id !== buyerId ||
        !scoped.some(
          (s) =>
            s.id === row.id &&
            s.track_id === row.track_id &&
            s.license_type_id === row.license_type_id,
        ),
    )
  )
    throw new Error("Purchase scope changed.");
  const [licenses, tracks, types] = await Promise.all([
    privileged
      .from("generated_licenses")
      .select(LICENSE_FIELDS)
      .eq("buyer_id", buyerId)
      .in(
        "order_id",
        rows.map((o) => o.id),
      ),
    privileged
      .from("tracks")
      .select("id,title,artist_user_id,cover_art_path")
      .in(
        "id",
        rows.map((o) => o.track_id),
      ),
    privileged
      .from("license_types")
      .select("id,name")
      .in(
        "id",
        rows.flatMap((o) => (o.license_type_id ? [o.license_type_id] : [])),
      ),
  ]);
  if (licenses.error || tracks.error || types.error)
    throw new Error("Unable to load purchase records.");
  const artistIds = [
    ...new Set((tracks.data || []).map((t) => t.artist_user_id)),
  ];
  const artists = artistIds.length
    ? await privileged
        .from("artist_profiles")
        .select("user_id,artist_name")
        .in("user_id", artistIds)
    : { data: [], error: null };
  // Display identity is optional; no private profile fields are loaded.
  // No signing, workers, payment/commerce RPCs, or audit writes occur during presentation.
  return scoped.flatMap((scope) => {
    const row = rows.find((o) => o.id === scope.id);
    if (!row) return [];
    const track = tracks.data?.find((t) => t.id === row.track_id);
    return [
      presentPurchase(
        row,
        (licenses.data?.find((l) => l.order_id === row.id) as
          | LicenseFacts
          | undefined) || null,
        {
          title: track?.title,
          artist: artists.data?.find((a) => a.user_id === track?.artist_user_id)
            ?.artist_name,
          licenseName: types.data?.find((t) => t.id === row.license_type_id)
            ?.name,
          artworkUrl:
            track?.cover_art_path &&
            !/^https?:|^\//i.test(track.cover_art_path) &&
            !track.cover_art_path
              .split("/")
              .some(
                (segment) => segment === "." || segment === ".." || !segment,
              )
              ? getPublicStorageUrl(
                  storageBuckets.coverArt,
                  track.cover_art_path,
                )
              : null,
        },
      ),
    ];
  });
}

function demoPurchases(buyerId: string): Purchase[] {
  return demoOrders
    .filter((o) => o.buyer_user_id === buyerId)
    .map((o) =>
      presentPurchase(
        {
          ...o,
          status: o.order_status,
          amount_cents: Math.round(o.amount_paid * 100),
        },
        null,
        {
          title: demoTracks.find((t) => t.id === o.track_id)?.title,
          artist: demoTracks.find((t) => t.id === o.track_id)?.artist_name,
          licenseName: demoLicenses.find((l) => l.id === o.license_type_id)
            ?.name,
          artworkUrl: null,
        },
      ),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

export async function getBuyerPurchasePage(
  input: {
    cursor?: string;
    query?: string;
    filter?: string;
    size?: string;
  } = {},
): Promise<PurchasePage> {
  const { user, client } = await buyerContext();
  const options = parsePurchaseOptions(input);
  if (!client) {
    const items = demoPurchases(user.id).filter(
      (p) =>
        (!options.query || p.id === options.query) &&
        (options.filter === "all" || p.payment.code === options.filter),
    );
    return {
      items: items.slice(0, options.pageSize),
      nextCursor: null,
      ...options,
    };
  }
  if (options.query && !ORDER_UUID.test(options.query))
    return {
      items: [],
      nextCursor: null,
      query: options.query,
      filter: options.filter,
      pageSize: options.pageSize,
    };
  let query = client
    .from("orders")
    .select(ORDER_FIELDS)
    .eq("buyer_user_id", user.id);
  if (options.query) {
    query = query.eq("id", options.query);
  }
  if (options.filter === "paid")
    query = query.in("status", ["paid", "fulfilled"]);
  else if (options.filter !== "all")
    query = query.eq("status", options.filter as "pending" | "refunded");
  if (options.cursor)
    query = query.or(
      `created_at.lt.${options.cursor.createdAt},and(created_at.eq.${options.cursor.createdAt},id.lt.${options.cursor.id})`,
    );
  const result = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(options.pageSize + 1);
  if (result.error) throw new Error("Unable to load purchases.");
  const scoped = (result.data || []) as OrderFacts[];
  if (scoped.some((o) => o.buyer_user_id !== user.id))
    throw new Error("Purchase scope denied.");
  const page = scoped.slice(0, options.pageSize);
  return {
    items: await presentOwned(user.id, page),
    nextCursor:
      scoped.length > options.pageSize
        ? purchaseCursor(page[page.length - 1])
        : null,
    query: options.query,
    filter: options.filter,
    pageSize: options.pageSize,
  };
}

export async function getBuyerPurchase(
  orderId: string,
): Promise<Purchase | null> {
  const { user, client } = await buyerContext();
  if (!client)
    return demoPurchases(user.id).find((p) => p.id === orderId) || null;
  if (!ORDER_UUID.test(orderId)) return null;
  const scope = await client
    .from("orders")
    .select(ORDER_FIELDS)
    .eq("id", orderId)
    .eq("buyer_user_id", user.id)
    .maybeSingle();
  if (scope.error) throw new Error("Unable to load purchase.");
  if (!scope.data || scope.data.buyer_user_id !== user.id) return null;
  return (await presentOwned(user.id, [scope.data as OrderFacts]))[0] || null;
}
