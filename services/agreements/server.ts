import { buildAgreementStoragePath, getAgreementAccessUrl, renderLicenseAgreementHtml } from "@/lib/license";
import { formatDateTime } from "@/lib/utils";
import { env } from "@/lib/env";
import { storageBuckets } from "@/lib/storage";
import { createSignedStorageUrl } from "@/services/storage/server";
import { createAdminSupabaseClient } from "@/services/supabase/admin";
import type { Database } from "@/types/database";

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
        amount_cents,
        currency,
        status,
        agreement_url,
        agreement_generated_at,
        fulfilled_at,
        created_at,
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

  const normalizedOrder = order as
    | (Database["public"]["Tables"]["orders"]["Row"] & {
        tracks?: {
          title?: string | null;
          slug?: string | null;
          artist_user_id?: string | null;
          rights_holders?: Array<{
            name: string;
            role_type: string;
            ownership_percent: number;
          }>;
        } | null;
        license_types?: { name?: string | null } | null;
      })
    | null;

  if (!normalizedOrder) {
    throw new Error("Order not found for agreement generation.");
  }

  if (normalizedOrder.agreement_url && normalizedOrder.agreement_generated_at && normalizedOrder.fulfilled_at) {
    return {
      path: buildAgreementStoragePath(orderId),
      agreementUrl: normalizedOrder.agreement_url,
      orderStatus: normalizedOrder.status
    };
  }

  const { data: buyerProfile } = await supabase
    .from("user_profiles")
    .select("full_name, email")
    .eq("id", normalizedOrder.buyer_user_id)
    .maybeSingle() as {
    data: Pick<Database["public"]["Tables"]["user_profiles"]["Row"], "full_name" | "email"> | null;
  };

  const artistUserId = normalizedOrder.tracks?.artist_user_id;
  const { data: artistProfile } = artistUserId
    ? await supabase.from("artist_profiles").select("artist_name").eq("user_id", artistUserId).maybeSingle()
    : { data: null };

  const html = renderLicenseAgreementHtml({
    orderId: normalizedOrder.id,
    createdAt: formatDateTime(normalizedOrder.created_at),
    trackTitle: normalizedOrder.tracks?.title || "Selected Track",
    artistName: artistProfile?.artist_name || "The Sync Exchange Artist",
    licenseName: normalizedOrder.license_types?.name || "License",
    amountPaid: Number(normalizedOrder.amount_cents || 0) / 100,
    currency: String(normalizedOrder.currency || "USD"),
    buyerName: buyerProfile?.full_name || "Buyer",
    buyerEmail: buyerProfile?.email || "billing@client.example",
    rightsHolders: (normalizedOrder.tracks?.rights_holders || []).map((holder) => ({
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
  const nextStatus = normalizedOrder.status === "refunded" ? "refunded" : "fulfilled";
  const generatedAt = new Date().toISOString();

  await supabase
    .from("orders")
    .update({
      agreement_url: agreementUrl,
      agreement_generated_at: normalizedOrder.agreement_generated_at || generatedAt,
      fulfilled_at: nextStatus === "fulfilled" ? normalizedOrder.fulfilled_at || generatedAt : normalizedOrder.fulfilled_at,
      status: nextStatus
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

export async function createAgreementSignedUrl(orderId: string, expiresInSeconds = 60 * 10) {
  return createSignedStorageUrl(
    {
      bucket: storageBuckets.agreements,
      path: buildAgreementStoragePath(orderId)
    },
    expiresInSeconds
  );
}
