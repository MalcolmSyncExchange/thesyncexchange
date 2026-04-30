import { buildAgreementNumber, buildGeneratedLicenseTermsSnapshot } from "@/lib/licenses/generated-license-snapshot";
import type { GeneratedLicenseTermsSnapshot } from "@/lib/licenses/templates/sync-license-template";
import { isMissingRelationError, isSchemaCacheTableError, warnSchemaFallbackOnce } from "@/services/supabase/schema-compat";
import type { AppSupabaseClient } from "@/services/supabase/types";
import type { Database, Json } from "@/types/database";

export function buildGeneratedLicenseStoragePath({
  buyerId,
  orderId
}: {
  buyerId: string;
  orderId: string;
}) {
  return `${buyerId}/${orderId}/sync-license-agreement.pdf`;
}

export async function loadGeneratedLicenseByOrderId(supabase: AppSupabaseClient, orderId: string) {
  const { data, error } = await supabase.from("generated_licenses").select("*").eq("order_id", orderId).maybeSingle();

  if (error && (isMissingRelationError(error, "generated_licenses") || isSchemaCacheTableError(error, "generated_licenses"))) {
    warnSchemaFallbackOnce(
      "generated-licenses-read",
      "generated_licenses is not available yet; license generation is running in order-row compatibility mode until migration 0013 is applied.",
      error
    );
    return null;
  }

  if (error) {
    throw error;
  }

  return data as Database["public"]["Tables"]["generated_licenses"]["Row"] | null;
}

export async function listGeneratedLicensesByOrderIds(supabase: AppSupabaseClient, orderIds: string[]) {
  if (!orderIds.length) {
    return new Map<string, Database["public"]["Tables"]["generated_licenses"]["Row"]>();
  }

  const { data, error } = await supabase.from("generated_licenses").select("*").in("order_id", orderIds);

  if (error && (isMissingRelationError(error, "generated_licenses") || isSchemaCacheTableError(error, "generated_licenses"))) {
    warnSchemaFallbackOnce(
      "generated-licenses-list",
      "generated_licenses is not available yet; order views are falling back to order-row agreement metadata until migration 0013 is applied.",
      error
    );
    return new Map();
  }

  if (error) {
    throw error;
  }

  return new Map((data || []).map((row) => [row.order_id, row as Database["public"]["Tables"]["generated_licenses"]["Row"]]));
}

export async function persistGeneratedLicenseSuccess(
  supabase: AppSupabaseClient,
  {
    existing,
    orderId,
    buyerId,
    trackId,
    licenseTypeId,
    agreementNumber,
    snapshot,
    pdfStoragePath,
    pdfContentType,
    pdfSizeBytes,
    htmlSnapshot,
    generatedAt
  }: {
    existing: Database["public"]["Tables"]["generated_licenses"]["Row"] | null;
    orderId: string;
    buyerId: string;
    trackId: string;
    licenseTypeId: string | null;
    agreementNumber: string;
    snapshot: GeneratedLicenseTermsSnapshot;
    pdfStoragePath: string;
    pdfContentType: string;
    pdfSizeBytes: number;
    htmlSnapshot: string;
    generatedAt: string;
  }
) {
  const payload: Database["public"]["Tables"]["generated_licenses"]["Insert"] = {
    id: existing?.id || crypto.randomUUID(),
    order_id: orderId,
    buyer_id: buyerId,
    track_id: trackId,
    license_type_id: licenseTypeId,
    agreement_number: existing?.agreement_number || agreementNumber,
    status: "generated",
    terms_snapshot_json: snapshot as unknown as Json,
    pdf_storage_path: pdfStoragePath,
    pdf_content_type: pdfContentType,
    pdf_size_bytes: pdfSizeBytes,
    html_snapshot: htmlSnapshot,
    generation_error: null,
    generated_at: generatedAt,
    downloaded_at: existing?.downloaded_at || null
  };

  const { data, error } = await supabase
    .from("generated_licenses")
    .upsert(payload, { onConflict: "order_id" })
    .select("*")
    .single();

  if (error && (isMissingRelationError(error, "generated_licenses") || isSchemaCacheTableError(error, "generated_licenses"))) {
    warnSchemaFallbackOnce(
      "generated-licenses-write-success",
      "generated_licenses is not available yet; successful license generation will be persisted only on the order row until migration 0013 is applied.",
      error
    );
    return null;
  }

  if (error) {
    throw error;
  }

  return data as Database["public"]["Tables"]["generated_licenses"]["Row"];
}

export async function persistGeneratedLicenseFailure(
  supabase: AppSupabaseClient,
  {
    existing,
    orderId,
    buyerId,
    trackId,
    licenseTypeId,
    agreementNumber,
    snapshot,
    pdfStoragePath,
    htmlSnapshot,
    generatedAt,
    generationError
  }: {
    existing: Database["public"]["Tables"]["generated_licenses"]["Row"] | null;
    orderId: string;
    buyerId: string;
    trackId: string;
    licenseTypeId: string | null;
    agreementNumber: string;
    snapshot: GeneratedLicenseTermsSnapshot | null;
    pdfStoragePath: string | null;
    htmlSnapshot: string | null;
    generatedAt: string | null;
    generationError: string;
  }
) {
  const payload: Database["public"]["Tables"]["generated_licenses"]["Insert"] = {
    id: existing?.id || crypto.randomUUID(),
    order_id: orderId,
    buyer_id: buyerId,
    track_id: trackId,
    license_type_id: licenseTypeId,
    agreement_number: existing?.agreement_number || agreementNumber,
    status: "failed",
    terms_snapshot_json: (snapshot || existing?.terms_snapshot_json || {}) as Json,
    pdf_storage_path: pdfStoragePath || existing?.pdf_storage_path || null,
    pdf_content_type: existing?.pdf_content_type || null,
    pdf_size_bytes: existing?.pdf_size_bytes || null,
    html_snapshot: htmlSnapshot || existing?.html_snapshot || null,
    generation_error: generationError,
    generated_at: generatedAt || existing?.generated_at || new Date().toISOString(),
    downloaded_at: existing?.downloaded_at || null
  };

  const { data, error } = await supabase
    .from("generated_licenses")
    .upsert(payload, { onConflict: "order_id" })
    .select("*")
    .single();

  if (error && (isMissingRelationError(error, "generated_licenses") || isSchemaCacheTableError(error, "generated_licenses"))) {
    warnSchemaFallbackOnce(
      "generated-licenses-write-failure",
      "generated_licenses is not available yet; failed license generation will be tracked only on the order row until migration 0013 is applied.",
      error
    );
    return null;
  }

  if (error) {
    throw error;
  }

  return data as Database["public"]["Tables"]["generated_licenses"]["Row"];
}

export async function markGeneratedLicenseDownloaded(supabase: AppSupabaseClient, orderId: string) {
  const downloadedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("generated_licenses")
    .update({
      downloaded_at: downloadedAt
    })
    .eq("order_id", orderId)
    .select("id, downloaded_at")
    .maybeSingle();

  if (error && (isMissingRelationError(error, "generated_licenses") || isSchemaCacheTableError(error, "generated_licenses"))) {
    warnSchemaFallbackOnce(
      "generated-licenses-mark-downloaded",
      "generated_licenses is not available yet; download tracking will stay disabled until migration 0013 is applied.",
      error
    );
    return null;
  }

  if (error) {
    throw error;
  }

  return data;
}

export function isGeneratedLicenseUnavailableError(error: unknown) {
  return isMissingRelationError(error, "generated_licenses") || isSchemaCacheTableError(error, "generated_licenses");
}
