"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { env, hasSupabaseEnv } from "@/lib/env";
import { createAdminSupabaseClient } from "@/services/supabase/admin";

export async function updateTrackStatusAction(formData: FormData) {
  const trackId = String(formData.get("trackId") || "");
  const status = String(formData.get("status") || "");

  if (!trackId || !status || !hasSupabaseEnv || env.demoMode) {
    return;
  }

  const supabase = createAdminSupabaseClient();
  if (!supabase) return;

  await supabase.from("tracks").update({ status }).eq("id", trackId);
  await appendTrackAuditLog(supabase, trackId, "track_status_updated", { status });

  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/review-queue");
  revalidatePath("/admin/tracks");
  revalidatePath("/admin/compliance");
  revalidatePath("/buyer/catalog");
}

export async function toggleTrackFeaturedAction(formData: FormData) {
  const trackId = String(formData.get("trackId") || "");
  const featured = String(formData.get("featured") || "") === "true";

  if (!trackId || !hasSupabaseEnv || env.demoMode) {
    return;
  }

  const supabase = createAdminSupabaseClient();
  if (!supabase) return;

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

  const supabase = createAdminSupabaseClient();
  if (!supabase) return;

  await supabase.from("admin_flags").update({ status }).eq("id", flagId);
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
  const actorId = await getAdminActorId();

  if (!trackId || !flagType || !notes || !actorId || !hasSupabaseEnv || env.demoMode) {
    return;
  }

  const supabase = createAdminSupabaseClient();
  if (!supabase) return;

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
  const actorId = await getAdminActorId();

  if (!trackId || !note || !actorId || !hasSupabaseEnv || env.demoMode) {
    return;
  }

  const supabase = createAdminSupabaseClient();
  if (!supabase) return;

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

  const supabase = createAdminSupabaseClient();
  if (!supabase) return;

  const { data: order } = await supabase.from("orders").select("track_id").eq("id", orderId).maybeSingle();
  await supabase.from("orders").update({ order_status: status }).eq("id", orderId);

  if (order?.track_id) {
    await appendTrackAuditLog(supabase, order.track_id, "order_status_updated", { orderId, status });
  }

  revalidatePath("/admin/orders");
  revalidatePath("/buyer/dashboard");
  revalidatePath("/buyer/orders");
  if (orderId) {
    revalidatePath(`/license-confirmation/${orderId}`);
  }
}

async function appendTrackAuditLog(
  supabase: NonNullable<ReturnType<typeof createAdminSupabaseClient>>,
  trackId: string,
  action: string,
  metadata: Record<string, unknown>
) {
  await supabase.from("track_audit_log").insert({
    track_id: trackId,
    actor_id: await getAdminActorId(),
    action,
    metadata
  });
}

async function getAdminActorId() {
  if (!hasSupabaseEnv || env.demoMode) {
    const raw = cookies().get("sync-exchange-session")?.value;
    if (!raw) return null;
    return JSON.parse(raw).id as string;
  }

  const { createServerSupabaseClient } = await import("@/services/supabase/server");
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  return user?.id || null;
}
