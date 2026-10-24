import { fulfillmentRecoveryRpc } from "@/services/orders/fulfillment-recovery";
import { env } from "@/lib/env";
import { buildPaymentClassification, getStripeCheckoutSessionMode } from "@/lib/payment-mode.mjs";
import { getPaymentRuntimeConfiguration } from "@/lib/server-env";
import { getAgreementAccessUrl } from "@/lib/license";
import { buildAgreementNumber } from "@/lib/licenses/generated-license-snapshot";
import { buildAcceptedPurchaseLicense } from "@/lib/licenses/accepted-purchase-snapshot";
import { licensingRpc, type AcceptedPurchase } from "@/services/licensing/purchases";
import { createHash } from "node:crypto";
import { renderSyncLicenseAgreementHtml, renderSyncLicenseAgreementPdf } from "@/lib/licenses/templates/sync-license-template";
import { reportOperationalError, reportOperationalEvent } from "@/lib/monitoring";
import { storageBuckets } from "@/lib/storage";
import { appendOrderActivityLog } from "@/services/orders/activity";
import {
  buildGeneratedLicenseStoragePath,
  loadGeneratedLicenseByOrderId,
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
  let agreementPath =
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

  if (
    !["paid", "fulfilled", "refunded"].includes(normalizedOrder.status) ||
    !normalizedOrder.paid_at ||
    !normalizedOrder.stripe_checkout_session_id ||
    !normalizedOrder.stripe_payment_intent_id
  ) {
    throw new Error("Stripe-verified payment evidence is required before generating an agreement.");
  }

  // One durable job per order; a stale worker writes a token-specific object,
  // then must pass database fencing before it can publish its artifact pointer.
  const recoveryToken = await fulfillmentRecoveryRpc(supabase, "claim_order_agreement_job", { p_order: orderId });
  if (typeof recoveryToken !== "string") throw new Error("Agreement generation is awaiting recovery.");
  agreementPath = `${normalizedOrder.buyer_user_id}/${orderId}/${recoveryToken}.pdf`;

  let htmlSnapshot: string | null = null;
  const generatedAt = normalizedOrder.agreement_generated_at || existingGeneratedLicense?.generated_at || new Date().toISOString();
  const payment = resolveAgreementPaymentClassification({
    checkoutSessionId: normalizedOrder.stripe_checkout_session_id,
    existingSnapshot: existingGeneratedLicense?.terms_snapshot_json
  });

  try {
    const accepted = await licensingRpc<AcceptedPurchase>(supabase, "read_accepted_purchase", { p_order: orderId });
    const snapshot = buildAcceptedPurchaseLicense({ accepted, agreementNumber, payment,
      paidAt: normalizedOrder.paid_at!, sessionId: normalizedOrder.stripe_checkout_session_id!, intentId: normalizedOrder.stripe_payment_intent_id! });
    htmlSnapshot = renderSyncLicenseAgreementHtml(snapshot);
    const pdf = await renderSyncLicenseAgreementPdf(snapshot);
    snapshot.pdfSha256 = createHash("sha256").update(pdf).digest("hex");
    snapshot.htmlSha256 = createHash("sha256").update(htmlSnapshot).digest("hex");
    const contentType = "application/pdf";
    const sizeBytes = pdf.byteLength;

    const { error: uploadError } = await supabase.storage.from(env.agreementsBucket).upload(agreementPath, pdf, {
      upsert: false,
      contentType
    });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const nextStatus = normalizedOrder.status === "refunded" ? "refunded" : "fulfilled";
    const persistedGeneratedLicense = await persistGeneratedLicenseSuccess(supabase, {
      recoveryToken,
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
        sizeBytes,
        ...payment
      }
    }).catch(() => undefined);

    reportOperationalEvent("agreement_generated", "Agreement artifact generated successfully.", {
      orderId,
      agreementNumber,
      generatedLicenseId: persistedGeneratedLicense.id,
      agreementPath,
      contentType,
      sizeBytes,
      orderStatus: persistedStatus,
      ...payment
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

    // A failed/stale worker cannot upsert over another worker's successful
    // license or regress a refund. Retain payment evidence and retry the job.
    await fulfillmentRecoveryRpc(supabase, "finish_order_agreement_job", { p_order: orderId, p_token: recoveryToken, p_payload: null }).catch(() => undefined);

    await appendOrderActivityLog(supabase, {
      orderId,
      source: "system",
      eventType: "agreement_generation_failed",
      message,
      metadata: {
        agreementNumber,
        agreementPath,
        ...payment
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

function resolveAgreementPaymentClassification({
  checkoutSessionId,
  existingSnapshot
}: {
  checkoutSessionId: string | null;
  existingSnapshot: unknown;
}) {
  const persisted = (existingSnapshot as { payment?: Record<string, unknown> } | null)?.payment;
  if (
    persisted &&
    (persisted.paymentMode === "test" || persisted.paymentMode === "live") &&
    typeof persisted.releaseMode === "string" &&
    typeof persisted.livemode === "boolean" &&
    typeof persisted.commercialRightsGranted === "boolean"
  ) {
    return persisted as {
      paymentMode: "test" | "live";
      releaseMode: "local" | "preview" | "production_beta" | "production_live";
      livemode: boolean;
      commercialRightsGranted: boolean;
    };
  }

  const runtime = getPaymentRuntimeConfiguration();
  const sessionMode = getStripeCheckoutSessionMode(checkoutSessionId);
  if (checkoutSessionId && sessionMode === "unknown") {
    throw new Error("Agreement generation is blocked because the Stripe Checkout Session mode is unknown.");
  }
  if (sessionMode !== "unknown" && sessionMode !== runtime.paymentMode) {
    throw new Error("Agreement generation is blocked because the Stripe Checkout Session belongs to a different payment mode.");
  }
  return buildPaymentClassification(runtime.paymentMode, runtime.releaseMode);
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
    .eq("id", orderId).in("status", ["paid", "fulfilled"]);

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
    .eq("id", orderId).in("status", ["paid", "fulfilled"]);

  if (fallback.error) {
    throw new Error(fallback.error.message);
  }

  return fallbackStatus;
}
