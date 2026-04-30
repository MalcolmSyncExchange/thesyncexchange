import { env } from "@/lib/env";
import { getAgreementAccessUrl } from "@/lib/license";
import { buildAgreementNumber, buildGeneratedLicenseTermsSnapshot } from "@/lib/licenses/generated-license-snapshot";
import { type GeneratedLicenseTermsSnapshot, renderSyncLicenseAgreementHtml, renderSyncLicenseAgreementPdf } from "@/lib/licenses/templates/sync-license-template";
import { reportOperationalError, reportOperationalEvent } from "@/lib/monitoring";
import { storageBuckets } from "@/lib/storage";
import { appendOrderActivityLog } from "@/services/orders/activity";
import {
  buildGeneratedLicenseStoragePath,
  loadGeneratedLicenseByOrderId,
  persistGeneratedLicenseFailure,
  persistGeneratedLicenseSuccess
} from "@/services/generated-licenses/server";
import { createSignedStorageUrl } from "@/services/storage/server";
import { isMissingColumnError, warnSchemaFallbackOnce } from "@/services/supabase/schema-compat";
import { createAdminSupabaseClient } from "@/services/supabase/admin";
import type { Database } from "@/types/database";

type AgreementOrderRow = Database["public"]["Tables"]["orders"]["Row"] & {
  tracks?: {
    id?: string | null;
    title?: string | null;
    slug?: string | null;
    artist_user_id?: string | null;
    rights_holders?: Array<{
      name: string;
      role_type: string;
      ownership_percent: number;
    }>;
  } | null;
  license_types?: {
    id?: string | null;
    slug?: string | null;
    name?: string | null;
    description?: string | null;
    exclusive?: boolean | null;
    terms_summary?: string | null;
    default_price_cents?: number | null;
  } | null;
};

export async function generateAgreementArtifactForOrder(orderId: string, options: { forceRegenerate?: boolean } = {}) {
  const { forceRegenerate = false } = options;
  const supabase = createAdminSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase service role key is required to generate agreement artifacts.");
  }

  const normalizedOrder = await loadOrderForAgreementGeneration(supabase, orderId);
  if (!normalizedOrder) {
    throw new Error("Order not found for agreement generation.");
  }

  const existingGeneratedLicense = await loadGeneratedLicenseByOrderId(supabase, orderId);
  const agreementNumber = existingGeneratedLicense?.agreement_number || buildAgreementNumber({ orderId, createdAt: normalizedOrder.created_at });
  const agreementPath =
    existingGeneratedLicense?.pdf_storage_path ||
    buildGeneratedLicenseStoragePath({
      buyerId: normalizedOrder.buyer_user_id,
      orderId
    });
  const agreementUrl = getAgreementAccessUrl(orderId);

  if (
    !forceRegenerate &&
    existingGeneratedLicense?.status === "generated" &&
    existingGeneratedLicense.pdf_storage_path &&
    normalizedOrder.agreement_generated_at &&
    (normalizedOrder.fulfilled_at || normalizedOrder.status === "fulfilled" || normalizedOrder.status === "refunded")
  ) {
    return {
      path: existingGeneratedLicense.pdf_storage_path,
      agreementUrl,
      agreementNumber,
      generatedLicenseId: existingGeneratedLicense.id,
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
  const { data: buyerCompanyProfile } = await supabase
    .from("buyer_profiles")
    .select("company_name, billing_email")
    .eq("user_id", normalizedOrder.buyer_user_id)
    .maybeSingle();
  const artistUserId = normalizedOrder.tracks?.artist_user_id;
  const { data: artistProfile } = artistUserId
    ? await supabase.from("artist_profiles").select("artist_name").eq("user_id", artistUserId).maybeSingle()
    : { data: null };

  let failedSnapshot: GeneratedLicenseTermsSnapshot | null = null;
  let htmlSnapshot: string | null = null;
  const generatedAt = normalizedOrder.agreement_generated_at || existingGeneratedLicense?.generated_at || new Date().toISOString();

  try {
    const snapshot = buildGeneratedLicenseTermsSnapshot({
      agreementNumber,
      context: {
        orderId: normalizedOrder.id,
        buyerId: normalizedOrder.buyer_user_id,
        trackId: normalizedOrder.track_id,
        licenseTypeId: normalizedOrder.license_type_id,
        amountCents: Number(normalizedOrder.amount_cents || 0),
        currency: String(normalizedOrder.currency || "USD"),
        createdAt: normalizedOrder.created_at,
        paidAt: normalizedOrder.paid_at,
        stripeCheckoutSessionId: normalizedOrder.stripe_checkout_session_id,
        stripePaymentIntentId: normalizedOrder.stripe_payment_intent_id,
        trackTitle: normalizedOrder.tracks?.title || "Selected Track",
        artistName: artistProfile?.artist_name || "The Sync Exchange Artist",
        buyerLegalName: buyerProfile?.full_name || "Buyer",
        buyerCompanyName: buyerCompanyProfile?.company_name || null,
        buyerEmail: buyerCompanyProfile?.billing_email || buyerProfile?.email || "billing@client.example",
        licenseTypeName: normalizedOrder.license_types?.name || "License",
        licenseTypeSlug: normalizedOrder.license_types?.slug || null,
        licenseTermsSummary: normalizedOrder.license_types?.terms_summary || normalizedOrder.license_types?.description || "Sync license terms as recorded by The Sync Exchange at purchase time.",
        licenseExclusive: Boolean(normalizedOrder.license_types?.exclusive),
        rightsHolders: (normalizedOrder.tracks?.rights_holders || []).map((holder) => ({
          name: holder.name,
          roleType: holder.role_type,
          ownershipPercent: Number(holder.ownership_percent || 0)
        }))
      }
    });
    failedSnapshot = snapshot;
    htmlSnapshot = renderSyncLicenseAgreementHtml(snapshot);
    const pdf = renderSyncLicenseAgreementPdf(snapshot);
    const contentType = "application/pdf";
    const sizeBytes = pdf.byteLength;

    const { error: uploadError } = await supabase.storage.from(env.agreementsBucket).upload(agreementPath, pdf, {
      upsert: true,
      contentType
    });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const nextStatus = normalizedOrder.status === "refunded" ? "refunded" : "fulfilled";
    const persistedGeneratedLicense = await persistGeneratedLicenseSuccess(supabase, {
      existing: existingGeneratedLicense,
      orderId,
      buyerId: normalizedOrder.buyer_user_id,
      trackId: normalizedOrder.track_id,
      licenseTypeId: normalizedOrder.license_type_id,
      agreementNumber,
      snapshot,
      pdfStoragePath: agreementPath,
      pdfContentType: contentType,
      pdfSizeBytes: sizeBytes,
      htmlSnapshot,
      generatedAt
    });

    if (!persistedGeneratedLicense) {
      await supabase.storage.from(env.agreementsBucket).remove([agreementPath]).catch(() => undefined);
      throw new Error(
        "generated_licenses is unavailable. Apply migration 0013 before automated agreement generation can complete."
      );
    }

    const persistedStatus = await persistAgreementSuccessState(supabase, {
      orderId,
      agreementUrl,
      agreementPath,
      contentType,
      sizeBytes,
      generatedAt,
      fulfilledAt: nextStatus === "fulfilled" ? normalizedOrder.fulfilled_at || generatedAt : normalizedOrder.fulfilled_at,
      nextStatus
    });

    await appendOrderActivityLog(supabase, {
      orderId,
      source: "system",
      eventType: "agreement_generated",
      message: "Generated license agreement stored securely for buyer delivery.",
      metadata: {
        agreementNumber,
        generatedLicenseId: persistedGeneratedLicense.id,
        agreementPath,
        contentType,
        sizeBytes
      }
    }).catch(() => undefined);

    reportOperationalEvent("agreement_generated", "Agreement artifact generated successfully.", {
      orderId,
      agreementNumber,
      generatedLicenseId: persistedGeneratedLicense.id,
      agreementPath,
      contentType,
      sizeBytes,
      orderStatus: persistedStatus
    });

    return {
      path: agreementPath,
      agreementUrl,
      agreementNumber,
      generatedLicenseId: persistedGeneratedLicense.id,
      orderStatus: persistedStatus
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agreement generation failed.";

    await persistGeneratedLicenseFailure(supabase, {
      existing: existingGeneratedLicense,
      orderId,
      buyerId: normalizedOrder.buyer_user_id,
      trackId: normalizedOrder.track_id,
      licenseTypeId: normalizedOrder.license_type_id,
      agreementNumber,
      snapshot: failedSnapshot,
      pdfStoragePath: agreementPath,
      htmlSnapshot,
      generatedAt,
      generationError: message
    }).catch(() => undefined);

    await persistAgreementFailureState(supabase, {
      orderId,
      agreementPath,
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
        agreementNumber,
        agreementPath
      }
    }).catch(() => undefined);

    reportOperationalError("agreement_generation_failed", error, {
      orderId,
      agreementNumber,
      agreementPath,
      nextStatus: normalizedOrder.status === "refunded" ? "refunded" : "paid"
    });

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
        track_id,
        license_type_id,
        amount_cents,
        currency,
        status,
        stripe_checkout_session_id,
        stripe_payment_intent_id,
        agreement_url,
        agreement_path,
        agreement_content_type,
        agreement_size_bytes,
        agreement_generated_at,
        agreement_generation_error,
        fulfilled_at,
        paid_at,
        created_at,
        tracks (
          id,
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
          id,
          slug,
          name,
          description,
          exclusive,
          terms_summary,
          default_price_cents
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
        track_id,
        license_type_id,
        amount_cents,
        currency,
        status,
        stripe_checkout_session_id,
        stripe_payment_intent_id,
        agreement_url,
        agreement_generated_at,
        fulfilled_at,
        paid_at,
        created_at,
        tracks (
          id,
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
          id,
          slug,
          name,
          description,
          exclusive,
          terms_summary,
          default_price_cents
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
