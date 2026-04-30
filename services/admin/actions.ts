"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { env, hasSupabaseEnv } from "@/lib/env";
import { reportOperationalError } from "@/lib/monitoring";
import { generateAgreementArtifactForOrder } from "@/services/agreements/server";
import { selectUserProfileCompat } from "@/services/auth/user-profiles";
import { loadGeneratedLicenseByOrderId } from "@/services/generated-licenses/server";
import { appendOrderActivityLog } from "@/services/orders/activity";
import { createPrivilegedSupabaseClient } from "@/services/supabase/privileged";
import { isMissingColumnError, warnSchemaFallbackOnce } from "@/services/supabase/schema-compat";
import { createServerSupabaseClient } from "@/services/supabase/server";
import type { AppSupabaseClient } from "@/services/supabase/types";
import type { Database, Json } from "@/types/database";

export async function updateTrackStatusAction(formData: FormData) {
  const trackId = String(formData.get("trackId") || "");
  const status = String(formData.get("status") || "");

  if (!trackId || !status || !hasSupabaseEnv || env.demoMode) {
    return;
  }

  const supabase = createPrivilegedSupabaseClient();
  const { data: trackContext } = await supabase.from("tracks").select("id, slug").eq("id", trackId).maybeSingle();

  const actorId = await requireAdminActorId();
  const updateResult = await supabase
    .from("tracks")
    .update({
      status: status as Database["public"]["Enums"]["track_status"],
      approved_at: status === "approved" ? new Date().toISOString() : null,
      approved_by: status === "approved" ? actorId : null
    })
    .eq("id", trackId);

  if (updateResult.error) {
    reportOperationalError("admin_track_status_update_failed", updateResult.error, {
      trackId,
      status,
      actorId: actorId || null
    });
    throw new Error(updateResult.error.message);
  }

  await appendTrackAuditLog(supabase, trackId, "track_status_updated", { status });

  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/review-queue");
  revalidatePath("/admin/tracks");
  revalidatePath("/admin/compliance");
  revalidatePath("/buyer/catalog");
  revalidatePath(`/artist/tracks/${trackContext?.slug || trackId}`);
  if (trackContext?.slug) {
    revalidatePath(`/buyer/catalog/${trackContext.slug}`);
    revalidatePath(`/buyer/checkout/${trackContext.slug}`);
  }
}

export async function toggleTrackFeaturedAction(formData: FormData) {
  const trackId = String(formData.get("trackId") || "");
  const featured = String(formData.get("featured") || "") === "true";

  if (!trackId || !hasSupabaseEnv || env.demoMode) {
    return;
  }

  const supabase = createPrivilegedSupabaseClient();
  await requireAdminActorId();

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

  const supabase = createPrivilegedSupabaseClient();

  await supabase.from("admin_flags").update({ status: status as Database["public"]["Enums"]["flag_status"] }).eq("id", flagId);
  const { data: flag } = await supabase.from("admin_flags").select("track_id").eq("id", flagId).maybeSingle();
  if (flag?.track_id) {
    await appendTrackAuditLog(supabase, flag.track_id, "compliance_flag_status_updated", { flagId, status });
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

  const supabase = createPrivilegedSupabaseClient();

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

  const supabase = createPrivilegedSupabaseClient();

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

  const supabase = createPrivilegedSupabaseClient();
  const now = new Date().toISOString();
  const order = await loadAdminOrderStatusSnapshot(supabase, orderId);
  const actorId = await requireAdminActorId();

  if (!order) {
    return;
  }

  if (status === "fulfilled") {
    await updateOrderStatusCompat(supabase, orderId, {
      paid_at: order.paid_at || now,
      agreement_generation_error: null
    });
    await generateAgreementArtifactForOrder(orderId);
  } else {
    await updateOrderStatusCompat(supabase, orderId, {
      status: status as Database["public"]["Enums"]["order_status"],
      paid_at: status === "paid" ? order.paid_at || now : order.paid_at,
      refunded_at: status === "refunded" ? order.refunded_at || now : order.refunded_at,
      fulfilled_at: status === "pending" ? null : order.fulfilled_at,
      agreement_generation_error: status === "pending" ? null : order.agreement_generation_error
    });
  }

  await appendOrderActivityLog(supabase, {
    orderId,
    actorId,
    source: "admin",
    eventType: "order_status_updated",
    message: `Admin manually updated the order status to ${status}.`,
    metadata: { status }
  }).catch(() => undefined);

  if (order.track_id) {
    await appendTrackAuditLog(supabase, order.track_id, "order_status_updated", { orderId, status });
  }

  revalidatePath("/admin/orders");
  revalidatePath("/buyer/dashboard");
  revalidatePath("/buyer/orders");
  if (orderId) {
    revalidatePath(`/license-confirmation/${orderId}`);
  }
}

export async function retryAgreementGenerationAction(formData: FormData) {
  const orderId = String(formData.get("orderId") || "");

  if (!orderId || !hasSupabaseEnv || env.demoMode) {
    return;
  }

  const supabase = createPrivilegedSupabaseClient();
  const actorId = await requireAdminActorId();
  const order = await loadAdminOrderStatusSnapshot(supabase, orderId);
  if (!order) {
    throw new Error("Order not found.");
  }

  const existingGeneratedLicense = await loadGeneratedLicenseByOrderId(supabase, orderId);
  await generateAgreementArtifactForOrder(orderId, { forceRegenerate: true });

  await appendOrderActivityLog(supabase, {
    orderId,
    actorId,
    source: "admin",
    eventType: "agreement_generation_retried",
    message: "Admin manually retried generated license agreement creation.",
    metadata: {
      existingAgreementNumber: existingGeneratedLicense?.agreement_number || null
    }
  }).catch(() => undefined);

  if (order.track_id) {
    await appendTrackAuditLog(supabase, order.track_id, "agreement_generation_retried", { orderId });
  }

  revalidatePath("/admin/orders");
  revalidatePath("/buyer/dashboard");
  revalidatePath("/buyer/orders");
  revalidatePath(`/license-confirmation/${orderId}`);
}

async function appendTrackAuditLog(
  supabase: AppSupabaseClient,
  trackId: string,
  action: string,
  metadata: Record<string, unknown>
) {
  await supabase.from("track_audit_log").insert({
    track_id: trackId,
    actor_id: await requireAdminActorId(),
    action,
    metadata: metadata as Json
  });
}

async function getAdminActorId() {
  if (!hasSupabaseEnv || env.demoMode) {
    const raw = cookies().get("sync-exchange-session")?.value;
    if (!raw) return null;
    const user = JSON.parse(raw) as { id: string; role?: string | null };
    return user.role === "admin" ? user.id : null;
  }

  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return null;
  }

  const profile = await selectUserProfileCompat(supabase, user.id);
  const role = String(profile.data?.role || user.user_metadata?.role || "");
  return role === "admin" ? user.id : null;
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
    .select("track_id, agreement_url, agreement_generated_at, agreement_generation_error, paid_at, fulfilled_at, refunded_at")
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
    .select("track_id, agreement_url, agreement_generated_at, paid_at, fulfilled_at, refunded_at")
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
