import { requireAccountScope } from "@/services/auth/authorization";
import { getMarketplacePage } from "@/services/buyer/marketplace";
import { isBuyerCatalogEligible } from "@/lib/buyer-catalog-eligibility";
import { licenseTypes as demoLicenseTypes, orders as demoOrders, tracks as demoTracks } from "@/lib/demo-data";
import { shouldUseDemoData } from "@/lib/env";
import { reportOperationalError } from "@/lib/monitoring";
import { hasAgreementBeenGenerated, hasExtendedOrderMetadata } from "@/lib/orders";
import { getStripeCheckoutSessionMode } from "@/lib/payment-mode.mjs";
import { selectUserProfileCompat } from "@/services/auth/user-profiles";
import { listGeneratedLicensesByOrderIds } from "@/services/generated-licenses/server";
import { createPrivilegedSupabaseClient } from "@/services/supabase/privileged";
import { createServerSupabaseClient } from "@/services/supabase/server";
import type { LicenseType, Order, BuyerTrack, Track } from "@/types/models";

/** Bounded compatibility entry point; discovery uses getMarketplacePage directly. */
export async function getBuyerCatalogTracks(buyerUserId?:string):Promise<BuyerTrack[]>{
 if(!buyerUserId)throw new Error("Buyer account scope is required.");
 return (await getMarketplacePage(buyerUserId)).items.filter(track=>isBuyerCatalogEligible({status:track.status,previewAvailable:Boolean(track.audio_file_url),activeLicenseCount:track.license_options.length}));
}
export async function getBuyerTrackBySlug(slug:string,buyerUserId?:string){
 if(!buyerUserId||slug.length>200)return null;return (await getMarketplacePage(buyerUserId,{slug})).items[0]||null;
}
export async function getBuyerFavorites(buyerUserId:string){return (await getMarketplacePage(buyerUserId,{savedOnly:"true"})).items;}

export async function getBuyerOrders(buyerUserId: string) {
  if (shouldUseDemoData()) {
    return demoOrders
      .filter((order) => order.buyer_user_id === buyerUserId)
      .map((order) => enrichOrder(order, demoTracks.find((track) => track.id === order.track_id) || null, demoLicenseTypes.find((license) => license.id === order.license_type_id) || null));
  }

  await requireAccountScope("buyer", buyerUserId);
  const supabase = await createPrivilegedSupabaseClient();
  const ordersResult = await supabase
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

  if (ordersResult.error) {
    reportOperationalError("buyer_orders_load_failed", ordersResult.error, {
      buyerUserId
    });
    throw new Error("Unable to load your orders right now.");
  }

  const orderRows = (ordersResult.data || []) as any[];
  const generatedLicensesByOrderId = await listGeneratedLicensesByOrderIds(
    supabase,
    orderRows.map((row) => row.id)
  );

  return orderRows.map((row) => enrichLiveOrder(row, generatedLicensesByOrderId.get(row.id) || null));
}

export async function getBuyerDashboardData(buyerUserId: string) {
  const [catalog, favorites, orders] = await Promise.all([
    getMarketplacePage(buyerUserId),
    getMarketplacePage(buyerUserId,{savedOnly:"true"}),
    getBuyerOrders(buyerUserId)
  ]);

  return {
    favorites: favorites.items,
    favoriteCount: favorites.total,
    orders,
    catalogCount: catalog.total,
    featuredTracks: catalog.items.slice(0, 3)
  };
}

export async function getOrderById(orderId: string) {
  if (shouldUseDemoData()) {
    const order = demoOrders.find((item) => item.id === orderId);
    if (!order) return null;
    return enrichOrder(order, demoTracks.find((track) => track.id === order.track_id) || null, demoLicenseTypes.find((license) => license.id === order.license_type_id) || null);
  }

  const authSupabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await authSupabase.auth.getUser();

  if (!user?.id) {
    return null;
  }

  const { data: viewerProfile, error: roleError } = await selectUserProfileCompat(authSupabase, user.id);
  const viewerRole = viewerProfile?.role;
  if (roleError || (viewerRole !== "buyer" && viewerRole !== "admin")) return null;
  const scope = await authSupabase.from("orders").select("id,buyer_user_id").eq("id", orderId).maybeSingle();
  if (scope.error || !scope.data || (viewerRole !== "admin" && scope.data.buyer_user_id !== user.id)) return null;
  const supabase = await createPrivilegedSupabaseClient();
  const { data, error } = await supabase.from("orders")
    .select("*, tracks(id,title,slug), license_types(id,name,slug,description,exclusive,default_price_cents,terms_summary,active)")
    .eq("id", orderId).maybeSingle();

  if (error) {
    reportOperationalError("buyer_order_load_failed", error, {
      orderId,
      viewerUserId: user.id
    });
    throw new Error("Unable to load this order right now.");
  }

  const row = data as any;
  if (!row) return null;

  if (viewerRole !== "admin" && row.buyer_user_id !== user.id) {
    return null;
  }

  const generatedLicense = await listGeneratedLicensesByOrderIds(supabase, [row.id]).then((map) => map.get(row.id) || null);
  return enrichLiveOrder(row, generatedLicense);
}

function enrichOrder(order: Order, track: Pick<Track, "id" | "title" | "slug"> | null, license: LicenseType | null) {
  return {
    ...order,
    track,
    license_type: license
  };
}

function enrichLiveOrder(row: any, generatedLicense: any) {
  const agreementGenerated = generatedLicense?.status === "generated" ? true : hasAgreementBeenGenerated(row);
  const agreementReady = Boolean(
    generatedLicense?.status === "generated" &&
      generatedLicense?.pdf_storage_path &&
      !generatedLicense?.generation_error &&
      !row.agreement_generation_error
  );
  const agreementDeliveryBlocked = generatedLicense
    ? generatedLicense.status === "generated" && (!generatedLicense.pdf_storage_path || Boolean(generatedLicense.generation_error || row.agreement_generation_error))
    : agreementGenerated;
  const degradedMessages = [
    ...(!hasExtendedOrderMetadata(row) ? ["Extended fulfillment metadata is unavailable until the manual Supabase order hardening SQL is applied."] : []),
    ...(row.agreement_generated_at && !row.agreement_path
      ? ["Agreement generation completed, but secure document delivery stays blocked until agreement_path metadata is live."]
      : []),
    ...(agreementGenerated && !generatedLicense ? ["The structured generated license record is not available for this order yet. Re-run agreement generation after migration 0013 is applied."] : [])
  ];
  const snapshotPayment = generatedLicense?.terms_snapshot_json?.payment;
  const sessionMode = getStripeCheckoutSessionMode(row.stripe_checkout_session_id);
  const paymentMode =
    snapshotPayment?.paymentMode === "test" || snapshotPayment?.paymentMode === "live"
      ? snapshotPayment.paymentMode
      : sessionMode;
  const commercialRightsGranted =
    typeof snapshotPayment?.commercialRightsGranted === "boolean"
      ? snapshotPayment.commercialRightsGranted
      : paymentMode === "live";

  return {
    id: row.id,
    buyer_user_id: row.buyer_user_id,
    track_id: row.track_id,
    license_type_id: row.license_type_id,
    currency: row.currency,
    created_at: row.created_at,
    updated_at: row.updated_at,
    checkout_created_at: row.checkout_created_at,
    checkout_started: Boolean(row.checkout_created_at || row.stripe_checkout_session_id),
    paid_at: row.paid_at,
    fulfilled_at: row.fulfilled_at,
    refunded_at: row.refunded_at,
    agreement_generated_at: row.agreement_generated_at,
    agreement_url: agreementReady ? `/api/orders/${row.id}/agreement` : null,
    amount_paid: Number(row.amount_cents || 0) / 100,
    order_status: row.status,
    agreement_generated: agreementGenerated,
    agreement_failed: Boolean(row.agreement_generation_error || generatedLicense?.generation_error || generatedLicense?.status === "failed"),
    agreement_ready: agreementReady,
    agreement_delivery_blocked: agreementDeliveryBlocked,
    agreement_number: generatedLicense?.agreement_number || null,
    generated_license_status: generatedLicense?.status || null,
    generated_license_downloaded_at: generatedLicense?.downloaded_at || null,
    payment_mode: paymentMode,
    release_mode: snapshotPayment?.releaseMode || (paymentMode === "test" ? "production_beta" : paymentMode === "live" ? "production_live" : null),
    test_transaction: paymentMode === "test",
    commercial_rights_granted: commercialRightsGranted,
    schema_degraded: !hasExtendedOrderMetadata(row) || (agreementGenerated && !generatedLicense),
    degraded_messages: degradedMessages,
    track: row.tracks || null,
    license_type: row.license_types
      ? {
          ...row.license_types,
          base_price: Number(row.license_types.default_price_cents || 0) / 100
        }
      : null
  };
}
