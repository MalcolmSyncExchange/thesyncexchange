import { buildAgreementStoragePath, getAgreementAccessUrl, renderLicenseAgreementHtml } from "@/lib/license";
import { formatDateTime } from "@/lib/utils";
import { env } from "@/lib/env";
import { createAdminSupabaseClient } from "@/services/supabase/admin";

export async function generateAgreementArtifactForOrder(orderId: string) {
  const supabase = createAdminSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase service role key is required to generate agreement artifacts.");
  }

  const { data: order } = await supabase
    .from("orders")
    .select(
      `
        id,
        buyer_user_id,
        amount_paid,
        currency,
        order_status,
        created_at,
        buyer:users!orders_buyer_user_id_fkey (
          full_name,
          email
        ),
        tracks (
          title,
          slug,
          artist_user_id,
          rights_holders (
            name,
            role_type,
            ownership_percent
          )
        ),
        license_types (
          name
        )
      `
    )
    .eq("id", orderId)
    .maybeSingle();

  if (!order) {
    throw new Error("Order not found for agreement generation.");
  }

  const artistUserId = (order as any).tracks?.artist_user_id;
  const { data: artistProfile } = artistUserId
    ? await supabase.from("artist_profiles").select("artist_name").eq("user_id", artistUserId).maybeSingle()
    : { data: null };

  const html = renderLicenseAgreementHtml({
    orderId: order.id,
    createdAt: formatDateTime(order.created_at),
    trackTitle: (order as any).tracks?.title || "Selected Track",
    artistName: artistProfile?.artist_name || "The Sync Exchange Artist",
    licenseName: (order as any).license_types?.name || "License",
    amountPaid: Number(order.amount_paid || 0),
    currency: String(order.currency || "USD"),
    buyerName: (order as any).buyer?.full_name || "Buyer",
    buyerEmail: (order as any).buyer?.email || "billing@client.example",
    rightsHolders: ((order as any).tracks?.rights_holders || []).map((holder: any) => ({
      name: holder.name,
      roleType: holder.role_type,
      ownershipPercent: Number(holder.ownership_percent || 0)
    }))
  });

  const path = buildAgreementStoragePath(orderId);

  const { error: uploadError } = await supabase.storage.from(env.agreementsBucket).upload(path, html, {
    upsert: true,
    contentType: "text/html; charset=utf-8"
  });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const agreementUrl = getAgreementAccessUrl(orderId);
  const nextStatus = order.order_status === "refunded" ? "refunded" : "fulfilled";

  await supabase
    .from("orders")
    .update({
      agreement_url: agreementUrl,
      order_status: nextStatus
    })
    .eq("id", orderId);

  return {
    path,
    agreementUrl,
    orderStatus: nextStatus
  };
}

export async function downloadAgreementArtifact(orderId: string) {
  const supabase = createAdminSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase service role key is required to read agreement artifacts.");
  }

  const path = buildAgreementStoragePath(orderId);
  const { data, error } = await supabase.storage.from(env.agreementsBucket).download(path);

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
