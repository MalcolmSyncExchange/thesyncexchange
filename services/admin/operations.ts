import { adminFlags as demoFlags, demoUsers, orders as demoOrders, tracks as demoTracks } from "@/lib/demo-data";
import { shouldUseDemoData } from "@/lib/env";
import { buildAdminOperationsSnapshot, type AdminOperationsInput } from "@/lib/admin-v2/operations";
import { requireAccountScope } from "@/services/auth/authorization";
import { requireSession } from "@/services/auth/session";
import { createPrivilegedSupabaseClient } from "@/services/supabase/privileged";

const LIST_LIMIT = 8;

/** Narrow, read-only Admin V2 DTO. Missing sources remain unavailable, never zero. */
export async function getAdminOperationsSnapshot() {
  if (shouldUseDemoData()) {
    await requireSession("admin");
    const flags = demoFlags.filter((flag) => flag.status === "open");
    const pending = demoTracks.filter((track) => track.status === "pending_review");
    return buildAdminOperationsSnapshot({
      checkedAt: new Date().toISOString(),
      counts: {
        users: demoUsers.length,
        tracks: demoTracks.length,
        pendingTracks: pending.length,
        orders: demoOrders.length,
        openFlags: flags.length,
        orderExceptions: 0
      },
      pendingTracks: pending.slice(0, LIST_LIMIT).map((track) => ({ id: track.id, title: track.title, created_at: track.created_at })),
      openFlags: flags.slice(0, LIST_LIMIT).map((flag) => ({
        id: flag.id,
        track_id: flag.track_id,
        flag_type: flag.flag_type,
        severity: flag.severity,
        created_at: flag.created_at,
        track_title: demoTracks.find((track) => track.id === flag.track_id)?.title ?? null
      })),
      orderExceptions: []
    });
  }

  // The canonical persisted role is checked before a service-role client is created.
  await requireAccountScope("admin");
  const supabase = await createPrivilegedSupabaseClient();

  const results = await Promise.allSettled([
    supabase.from("user_profiles").select("id", { count: "exact", head: true }),
    supabase.from("tracks").select("id", { count: "exact", head: true }),
    supabase.from("tracks").select("id", { count: "exact", head: true }).eq("status", "pending_review"),
    supabase.from("orders").select("id", { count: "exact", head: true }),
    supabase.from("admin_flags").select("id", { count: "exact", head: true }).eq("status", "open"),
    supabase.from("tracks").select("id,title,created_at").eq("status", "pending_review").order("created_at", { ascending: true }).limit(LIST_LIMIT),
    supabase.from("admin_flags").select("id,track_id,flag_type,severity,created_at").eq("status", "open").order("created_at", { ascending: true }).limit(LIST_LIMIT),
    supabase.from("orders")
      .select("id,status,created_at,agreement_generation_error,agreement_generated_at", { count: "exact" })
      .eq("status", "paid")
      .not("agreement_generation_error", "is", null)
      .is("agreement_generated_at", null)
      .order("created_at", { ascending: true })
      .limit(LIST_LIMIT)
  ]);

  function availableCount(index: number) {
    const result = results[index];
    return result.status === "fulfilled" && !result.value.error ? result.value.count ?? null : null;
  }

  const pendingResult = results[5];
  const flagResult = results[6];
  const orderResult = results[7];
  const pendingRows = pendingResult.status === "fulfilled" && !pendingResult.value.error ? pendingResult.value.data : null;
  const flagRows = flagResult.status === "fulfilled" && !flagResult.value.error ? flagResult.value.data : null;
  const orderRows = orderResult.status === "fulfilled" && !orderResult.value.error ? orderResult.value.data : null;
  const input: AdminOperationsInput = {
    checkedAt: new Date().toISOString(),
    counts: {
      users: availableCount(0),
      tracks: availableCount(1),
      pendingTracks: availableCount(2),
      orders: availableCount(3),
      openFlags: availableCount(4),
      orderExceptions: availableCount(7)
    },
    pendingTracks: pendingRows ? pendingRows.map((row) => ({ id: row.id, title: row.title, created_at: row.created_at })) : null,
    openFlags: flagRows ? flagRows.map((row) => ({
      id: row.id,
      track_id: row.track_id,
      flag_type: row.flag_type,
      severity: row.severity,
      created_at: row.created_at,
      track_title: null
    })) : null,
    orderExceptions: orderRows ? orderRows.map((row) => ({
      id: row.id,
      status: row.status,
      created_at: row.created_at,
      agreement_generation_error: Boolean(row.agreement_generation_error),
      agreement_generated_at: row.agreement_generated_at
    })) : null
  };

  return buildAdminOperationsSnapshot(input);
}
