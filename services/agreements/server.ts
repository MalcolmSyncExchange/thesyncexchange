import { buildAgreementStoragePath, getAgreementAccessUrl, renderLicenseAgreementPdf } from "@/lib/license";
import { env } from "@/lib/env";
import { storageBuckets } from "@/lib/storage";
import { formatDateTime } from "@/lib/utils";
import { appendOrderActivityLog } from "@/services/orders/activity";
import { createSignedStorageUrl } from "@/services/storage/server";
import { isMissingColumnError, warnSchemaFallbackOnce } from "@/services/supabase/schema-compat";
import { createAdminSupabaseClient } from "@/services/supabase/admin";
import type { Database } from "@/types/database";

type AgreementOrderRow = Database["public"]["Tables"]["orders"]["Row"] & {
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
};

export async function generateAgreementArtifactForOrder(orderId: string) {
  const supabase = createAdminSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase service role key is required to generate agreement artifacts.");
  }

  const normalizedOrder = await loadOrderForAgreementGeneration(supabase, orderId);
  if (!normalizedOrder) {
    throw new Error("Order not found for agreement generation.");
  }

  const path = normalizedOrder.agreement_path || buildAgreementStoragePath(orderId);

  if (
    (normalizedOrder.agreement_path || normalizedOrder.agreement_url) &&
    normalizedOrder.agreement_generated_at &&
    (normalizedOrder.fulfilled_at || normalizedOrder.status === "refunded")
  ) {
    return {
      path,
      agreementUrl: normalizedOrder.agreement_url || getAgreementAccessUrl(orderId),
      orderStatus: normalizedOrder.status
    };
  }

  const { data: buyerProfile } = (await supabase
    .from("user_profiles")
    .select("full_name, email")
    .eq("id", normalizedOrder.buyer_user_id)
    .maybeSingle()) as {
    data: Pick<Database["public"]["Tables"]["user_profiles"]["Row"], "full_name" | "email"> | null;
  };

  const artistUserId = normalizedOrder.tracks?.artist_user_id;
  const { data: artistProfile } = artistUserId
    ? await supabase.from("artist_profiles").select("artist_name").eq("user_id", artistUserId).maybeSingle()
    : { data: null };

  const pdf = renderLicenseAgreementPdf({
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

  try {
    const contentType = "application/pdf";
    const sizeBytes = pdf.byteLength;

    const { error: uploadError } = await supabase.storage.from(env.agreementsBucket).upload(path, pdf, {
      upsert: true,
      contentType
    });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const agreementUrl = getAgreementAccessUrl(orderId);
    const nextStatus = normalizedOrder.status === "refunded" ? "refunded" : "fulfilled";
    const generatedAt = new Date().toISOString();

    const persistedStatus = await persistAgreementSuccessState(supabase, {
      orderId,
      agreementUrl,
      agreementPath: path,
      contentType,
      sizeBytes,
      generatedAt: normalizedOrder.agreement_generated_at || generatedAt,
      fulfilledAt: nextStatus === "fulfilled" ? normalizedOrder.fulfilled_at || generatedAt : normalizedOrder.fulfilled_at,
      nextStatus
    });

    await appendOrderActivityLog(supabase, {
      orderId,
      source: "system",
      eventType: "agreement_generated",
      message: "Agreement artifact generated and stored for buyer delivery.",
      metadata: {
        agreementPath: path,
        contentType,
        sizeBytes
      }
    }).catch(() => undefined);

    return {
      path,
      agreementUrl,
      orderStatus: persistedStatus
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agreement generation failed.";

    await persistAgreementFailureState(supabase, {
      orderId,
      agreementPath: path,
      message,
      fulfilledAt: normalizedOrder.status === "refunded" ? normalizedOrder.fulfilled_at : null,
      nextStatus: normalizedOrder.status === "refunded" ? "refunded" : "paid"
    });

    await appendOrderActivityLog(supabase, {
      orderId,
      source: "system",
      eventType: "agreement_generation_failed",
      message,
      metadata: {
        agreementPath: path
      }
    }).catch(() => undefined);

    throw error;
  }
}

export async function downloadAgreementArtifact(path: string) {
  const supabase = createAdminSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase service role key is required to read agreement artifacts.");
  }

  const { data, error } = await supabase.storage.from(env.agreementsBucket).download(path);
  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function createAgreementSignedUrl(path: string, expiresInSeconds = 60 * 10) {
  return createSignedStorageUrl(
    {
      bucket: storageBuckets.agreements,
      path
    },
    expiresInSeconds
  );
}

async function loadOrderForAgreementGeneration(
  supabase: NonNullable<ReturnType<typeof createAdminSupabaseClient>>,
  orderId: string
) {
  const primary = await supabase
    .from("orders")
    .select(
      `
        id,
        buyer_user_id,
        amount_cents,
        currency,
        status,
        agreement_url,
        agreement_path,
        agreement_content_type,
        agreement_size_bytes,
        agreement_generated_at,
        agreement_generation_error,
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

  if (!primary.error) {
    return primary.data as AgreementOrderRow | null;
  }

  if (!isMissingColumnError(primary.error, ["agreement_path", "agreement_generation_error"])) {
    throw new Error(primary.error.message);
  }

  warnSchemaFallbackOnce(
    "order-fulfillment-read",
    "Order fulfillment metadata columns are not available yet; agreement generation is falling back to reduced persistence until migration 0010 is applied.",
    primary.error
  );

  const fallback = await supabase
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

  if (fallback.error) {
    throw new Error(fallback.error.message);
  }

  return fallback.data
    ? ({
        ...fallback.data,
        agreement_path: null,
        agreement_content_type: null,
        agreement_size_bytes: null,
        agreement_generation_error: null
      } as unknown as AgreementOrderRow)
    : null;
}

async function persistAgreementSuccessState(
  supabase: NonNullable<ReturnType<typeof createAdminSupabaseClient>>,
  {
    orderId,
    agreementUrl,
    agreementPath,
    contentType,
    sizeBytes,
    generatedAt,
    fulfilledAt,
    nextStatus
  }: {
    orderId: string;
    agreementUrl: string;
    agreementPath: string;
    contentType: string;
    sizeBytes: number;
    generatedAt: string;
    fulfilledAt: string | null | undefined;
    nextStatus: "fulfilled" | "refunded";
  }
) {
  const primary = await supabase
    .from("orders")
    .update({
      agreement_url: agreementUrl,
      agreement_path: agreementPath,
      agreement_content_type: contentType,
      agreement_size_bytes: sizeBytes,
      agreement_generation_error: null,
      agreement_generated_at: generatedAt,
      fulfilled_at: fulfilledAt,
      status: nextStatus
    })
    .eq("id", orderId);

  if (!primary.error) {
    return nextStatus;
  }

  if (!isMissingColumnError(primary.error, ["agreement_path", "agreement_generation_error"])) {
    throw new Error(primary.error.message);
  }

  warnSchemaFallbackOnce(
    "order-fulfillment-write",
    "Order fulfillment metadata columns are not available yet; agreement generation will persist only legacy order fields until migration 0010 is applied.",
    primary.error
  );

  const fallbackStatus = nextStatus === "refunded" ? "refunded" : "paid";
  const fallback = await supabase
    .from("orders")
    .update({
      agreement_generated_at: generatedAt,
      fulfilled_at: nextStatus === "refunded" ? fulfilledAt : null,
      status: fallbackStatus
    })
    .eq("id", orderId);

  if (fallback.error) {
    throw new Error(fallback.error.message);
  }

  return fallbackStatus;
}

async function persistAgreementFailureState(
  supabase: NonNullable<ReturnType<typeof createAdminSupabaseClient>>,
  {
    orderId,
    agreementPath,
    message,
    fulfilledAt,
    nextStatus
  }: {
    orderId: string;
    agreementPath: string;
    message: string;
    fulfilledAt: string | null | undefined;
    nextStatus: "paid" | "refunded";
  }
) {
  const primary = await supabase
    .from("orders")
    .update({
      agreement_path: agreementPath,
      agreement_generation_error: message,
      fulfilled_at: fulfilledAt,
      status: nextStatus
    })
    .eq("id", orderId);

  if (!primary.error) {
    return;
  }

  if (!isMissingColumnError(primary.error, ["agreement_path", "agreement_generation_error"])) {
    throw new Error(primary.error.message);
  }

  warnSchemaFallbackOnce(
    "order-fulfillment-failure-write",
    "Agreement failure metadata columns are not available yet; order status will fall back to legacy fields until migration 0010 is applied.",
    primary.error
  );

  const fallback = await supabase
    .from("orders")
    .update({
      fulfilled_at: fulfilledAt,
      status: nextStatus
    })
    .eq("id", orderId);

  if (fallback.error) {
    throw new Error(fallback.error.message);
  }
}
