"use server";
import { performPaymentRequest } from "@/services/orders/payments";

import { revalidatePath } from "next/cache";
import { hasPrivilegedAssurance } from "@/services/auth/security";
import { cookies } from "next/headers";

import { env, hasSupabaseEnv } from "@/lib/env";
import { reportOperationalError } from "@/lib/monitoring";
import { getPaymentActivityMetadata, getPaymentRuntimeConfiguration } from "@/lib/server-env";
import { getStripeCheckoutSessionMode } from "@/lib/payment-mode.mjs";
import { generateAgreementArtifactForOrder } from "@/services/agreements/server";
import { selectUserProfileCompat } from "@/services/auth/user-profiles";
import { loadGeneratedLicenseByOrderId } from "@/services/generated-licenses/server";
import { appendOrderActivityLog } from "@/services/orders/activity";
import { isMissingColumnError, warnSchemaFallbackOnce } from "@/services/supabase/schema-compat";
import { createServerSupabaseClient } from "@/services/supabase/server";
import type { AppSupabaseClient } from "@/services/supabase/types";
import type { Database, Json } from "@/types/database";

export type TrackStatusUpdateResult =
  | { status: "ok" }
  | { status: "rejected"; code: "OWNERSHIP_TOTAL_INVALID" | "RIGHTS_REVIEW_REQUIRED" }
  | { status: "unavailable"; code: "TRACK_STATUS_UPDATE_FAILED" }
  | { status: "invalid_request"; code: "TRACK_STATUS_REQUEST_INVALID" }
  | { status: "not_updated"; code: "TRACK_NOT_UPDATED" };

export async function updateTrackStatusAction(formData: FormData): Promise<void> {
  const result = await updateTrackStatusWithResultAction(formData);
  if (result.status === "unavailable" || result.status === "not_updated") {
    throw new Error("Track status could not be updated.");
  }
}

export async function updateTrackStatusWithResultAction(formData: FormData): Promise<TrackStatusUpdateResult> {
  const trackId = String(formData.get("trackId") || "");
  const status = String(formData.get("status") || "");

  if (!trackId || !status || !hasSupabaseEnv || env.demoMode) {
    return { status: "invalid_request", code: "TRACK_STATUS_REQUEST_INVALID" };
  }

  const actorId = await requireAdminActorId();

  const unavailable = (): TrackStatusUpdateResult => {
    reportOperationalError("admin_track_status_update_failed", "Track status write failed.");
    return { status: "unavailable", code: "TRACK_STATUS_UPDATE_FAILED" };
  };

  let supabase: AppSupabaseClient;
  let slug: string | null;
  try {
    supabase = await createServerSupabaseClient();
    const updateResult = await supabase
      .from("tracks")
      .update({
        status: status as Database["public"]["Enums"]["track_status"],
        approved_at: status === "approved" ? new Date().toISOString() : null,
        approved_by: status === "approved" ? actorId : null
      })
      .eq("id", trackId)
      .select("slug")
      .maybeSingle();

    if (updateResult.error) {
      const { code, message } = updateResult.error;
      // The current trigger uses a shared SQLSTATE, so classify only its exact ownership error.
      if (status === "approved" && code === "P0001" &&
        message === "Approved tracks must have rights holder ownership totals equal to 100%.") {
        return { status: "rejected", code: "OWNERSHIP_TOTAL_INVALID" };
      }
      if (status === "approved" && code === "42501" &&
        (message === "Current verified rights review required" || message === "Reviewed documentation revoked or expired")) {
        return { status: "rejected", code: "RIGHTS_REVIEW_REQUIRED" };
      }
      return unavailable();
    }

    if (!updateResult.data) return { status: "not_updated", code: "TRACK_NOT_UPDATED" };
    slug = updateResult.data.slug;
  } catch {
    return unavailable();
  }

  await appendTrackAuditLog(supabase, trackId, "track_status_updated", { status });

  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/review-queue");
  revalidatePath("/admin/tracks");
  revalidatePath("/admin/compliance");
  revalidatePath("/buyer/catalog");
  revalidatePath(`/artist/tracks/${slug || trackId}`);
  if (slug) {
    revalidatePath(`/buyer/catalog/${slug}`);
    revalidatePath(`/buyer/checkout/${slug}`);
  }
  return { status: "ok" };
}

export async function toggleTrackFeaturedAction(formData: FormData) {
  const trackId = String(formData.get("trackId") || "");
  const featured = String(formData.get("featured") || "") === "true";

  if (!trackId || !hasSupabaseEnv || env.demoMode) {
    return;
  }

  await requireAdminActorId();
  const supabase = await createServerSupabaseClient();

  await supabase.from("tracks").update({ featured }).eq("id", trackId);
  await appendTrackAuditLog(supabase, trackId, "track_featured_toggled", { featured });

  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/tracks");
  revalidatePath("/buyer/catalog");
}

export async function updateComplianceFlagStatusAction(formData: FormData) {
  const flagId = String(formData.get("flagId") || "");
  const status = String(formData.get("status") || "");

  if (!flagId || !status || !hasSupabaseEnv || env.demoMode) {
    return;
  }

  if (status !== "open" && status !== "resolved") {
    throw new Error("Invalid compliance flag status.");
  }

  const actorId = await requireAdminActorId();
  const supabase = await createServerSupabaseClient();

  const updateResult = await supabase
    .from("admin_flags")
    .update({ status: status as Database["public"]["Enums"]["flag_status"] })
    .eq("id", flagId);
  if (updateResult.error) {
    reportOperationalError("admin_compliance_flag_status_update_failed", updateResult.error, {
      flagId,
      status,
      actorId
    });
    throw new Error(updateResult.error.message);
  }

  const { data: flag } = await supabase.from("admin_flags").select("track_id").eq("id", flagId).maybeSingle();
  if (flag?.track_id) {
    await appendTrackAuditLog(supabase, flag.track_id, "compliance_flag_status_updated", { flagId, status }, actorId);
    revalidatePath(`/admin/tracks/${flag.track_id}`);
  }

  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/compliance");
  if (flag?.track_id) {
    revalidatePath(`/admin/tracks/${flag.track_id}`);
  }
}

export async function createComplianceFlagAction(formData: FormData) {
  const trackId = String(formData.get("trackId") || "");
  const flagType = String(formData.get("flagType") || "");
  const severity = String(formData.get("severity") || "medium");
  const notes = String(formData.get("notes") || "");
  const actorId = await requireAdminActorId();

  if (!trackId || !flagType || !notes || !actorId || !hasSupabaseEnv || env.demoMode) {
    return;
  }

  const supabase = await createServerSupabaseClient();

  await supabase.from("admin_flags").insert({
    track_id: trackId,
    flag_type: flagType,
    severity,
    notes,
    status: "open",
    created_by: actorId
  });

  await appendTrackAuditLog(supabase, trackId, "compliance_flag_created", { flagType, severity });

  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/compliance");
  revalidatePath(`/admin/tracks/${trackId}`);
}

export async function addReviewNoteAction(formData: FormData) {
  const trackId = String(formData.get("trackId") || "");
  const note = String(formData.get("note") || "");
  const actorId = await requireAdminActorId();

  if (!trackId || !note || !actorId || !hasSupabaseEnv || env.demoMode) {
    return;
  }

  const supabase = await createServerSupabaseClient();

  await supabase.from("review_notes").insert({
    track_id: trackId,
    author_id: actorId,
    note
  });

  await appendTrackAuditLog(supabase, trackId, "review_note_added", { note });

  revalidatePath(`/admin/tracks/${trackId}`);
}

export async function updateOrderStatusAction(formData: FormData) {
  const orderId = String(formData.get("orderId") || "");
  const status = String(formData.get("status") || "");

  if (!orderId || !status || !hasSupabaseEnv || env.demoMode) {
    return;
  }

  await requireAdminActorId();
  // Financial state is derived from authenticated provider evidence. A manual
  // selector must never manufacture payment, refunds, or fulfillment.
  throw new Error("Payment status cannot be edited. Use audited payment operations and verified provider evidence.");
}

export async function retryAgreementGenerationAction(formData: FormData) {
  await performPaymentRequest({ action: "operate", order: String(formData.get("orderId") || ""), key: String(formData.get("requestId") || ""),
    command: "retry_fulfillment", reason: String(formData.get("reason") || ""), reference: String(formData.get("reference") || "") });
  revalidatePath("/admin/orders");
  revalidatePath("/admin/payments");
}

async function appendTrackAuditLog(
  supabase: AppSupabaseClient,
  trackId: string,
  action: string,
  metadata: Record<string, unknown>,
  actorId?: string
) {
  await supabase.from("track_audit_log").insert({
    track_id: trackId,
    actor_id: actorId ?? (await requireAdminActorId()),
    action,
    metadata: metadata as Json
  });
}

async function getAdminActorId() {
  if (!hasSupabaseEnv || env.demoMode) {
    const raw = (await cookies()).get("sync-exchange-session")?.value;
    if (!raw) return null;
    const user = JSON.parse(raw) as { id: string; role?: string | null };
    return user.role === "admin" ? user.id : null;
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return null;
  }

  const profile = await selectUserProfileCompat(supabase, user.id);
  const role = String(profile.data?.role || "");
  if(role !== "admin" || profile.error || !await hasPrivilegedAssurance(supabase))return null;
  const permission=await supabase.rpc("sec_has_capability",{p_cap:"full_admin"});
  return !permission.error && permission.data===true ? user.id : null;
}

async function requireAdminActorId() {
  const actorId = await getAdminActorId();
  if (!actorId) {
    throw new Error("Admin access is required for this action.");
  }

  return actorId;
}

async function loadAdminOrderStatusSnapshot(supabase: AppSupabaseClient, orderId: string) {
  const primary = await supabase
    .from("orders")
    .select("track_id, agreement_url, agreement_generated_at, agreement_generation_error, paid_at, fulfilled_at, refunded_at, stripe_checkout_session_id, stripe_payment_intent_id")
    .eq("id", orderId)
    .maybeSingle();

  if (!primary.error) {
    return primary.data as {
      track_id: string | null;
      agreement_url: string | null;
      agreement_generated_at: string | null;
      agreement_generation_error: string | null;
      paid_at: string | null;
      fulfilled_at: string | null;
      refunded_at: string | null;
      stripe_checkout_session_id: string | null;
      stripe_payment_intent_id: string | null;
    } | null;
  }

  if (!isMissingColumnError(primary.error, "agreement_generation_error")) {
    throw new Error(primary.error.message);
  }

  warnSchemaFallbackOnce(
    "admin-order-status-read",
    "Agreement generation metadata is not available yet; manual admin order controls will run in reduced mode until migration 0010 is applied.",
    primary.error
  );

  const fallback = await supabase
    .from("orders")
    .select("track_id, agreement_url, agreement_generated_at, paid_at, fulfilled_at, refunded_at, stripe_checkout_session_id, stripe_payment_intent_id")
    .eq("id", orderId)
    .maybeSingle();

  if (fallback.error) {
    throw new Error(fallback.error.message);
  }

  return fallback.data
    ? {
        ...fallback.data,
        agreement_generation_error: null
      }
    : null;
}

async function updateOrderStatusCompat(supabase: AppSupabaseClient, orderId: string, values: Database["public"]["Tables"]["orders"]["Update"]) {
  const primary = await supabase.from("orders").update(values).eq("id", orderId);

  if (!primary.error) {
    return;
  }

  if (!isMissingColumnError(primary.error, "agreement_generation_error")) {
    throw new Error(primary.error.message);
  }

  warnSchemaFallbackOnce(
    "admin-order-status-write",
    "Agreement generation metadata is not available yet; admin order updates will skip that field until migration 0010 is applied.",
    primary.error
  );

  const { agreement_generation_error: _skipAgreementError, ...fallbackValues } = values;
  const fallback = await supabase.from("orders").update(fallbackValues).eq("id", orderId);

  if (fallback.error) {
    throw new Error(fallback.error.message);
  }
}
