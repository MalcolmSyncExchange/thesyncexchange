import "server-only";

import { demoUsers, artistProfiles, buyerProfiles, licenseTypes as demoLicenseTypes, orders as demoOrders, tracks as demoTracks } from "@/lib/demo-data";
import { shouldUseDemoData } from "@/lib/env";
import { ADMIN_USER_PAGE_SIZE, ADMIN_USER_UUID, adminUserSummary, parseAdminUserOptions, purchaseStates, type AdminUserDirectory, type AdminUserSummary } from "@/lib/admin-v2/users";
import { requireAccountScope } from "@/services/auth/authorization";
import { requireSession } from "@/services/auth/session";
import { createPrivilegedSupabaseClient } from "@/services/supabase/privileged";

type SourceState = "available" | "partial" | "unavailable";
type AdminTrackSummary = { id: string; title: string; status: string; createdAt: string };
type AdminOrderSummary = {
  id: string; createdAt: string; amountCents: number; currency: string; title: string; licenseName: string;
  payment: string; license: string; agreement: string; receipt: string; files: string;
};
export type AdminUserDetail = {
  user: AdminUserSummary;
  profile: { label: string; value: string } | null;
  profileSource: SourceState;
  recordsSource: SourceState;
  recordCount: number | null;
  tracks: AdminTrackSummary[];
  orders: AdminOrderSummary[];
};

export async function getAdminUserDirectory(input: { q?: string; role?: string; page?: string } = {}): Promise<AdminUserDirectory> {
  const options = parseAdminUserOptions(input);
  if (shouldUseDemoData()) {
    await requireSession("admin");
    const matching = demoUsers.filter((user) => (options.role === "all" || user.role === options.role) &&
      `${user.full_name} ${user.email}`.toLowerCase().includes(options.query.toLowerCase()));
    const from = (options.page - 1) * ADMIN_USER_PAGE_SIZE;
    return { ...options, total: matching.length, items: matching.slice(from, from + ADMIN_USER_PAGE_SIZE).flatMap((user) => {
      const summary = adminUserSummary(user);
      return summary ? [summary] : [];
    }) };
  }

  // The persisted role is checked before a privileged client or user query exists.
  await requireAccountScope("admin");
  const supabase = await createPrivilegedSupabaseClient();
  const from = (options.page - 1) * ADMIN_USER_PAGE_SIZE;
  let query = supabase.from("user_profiles")
    .select("id,full_name,email,role,created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + ADMIN_USER_PAGE_SIZE - 1);
  if (options.role !== "all") query = query.eq("role", options.role);
  if (options.query) query = query.or(`full_name.ilike.%${options.query}%,email.ilike.%${options.query}%`);
  const result = await query;
  if (result.error || result.count === null) throw new Error("Unable to load users. Please retry.");
  return { ...options, total: result.count, items: (result.data || []).flatMap((row) => {
    const summary = adminUserSummary(row);
    return summary ? [summary] : [];
  }) };
}

export async function getAdminUserDetail(id: string): Promise<AdminUserDetail | null> {
  if (shouldUseDemoData()) {
    await requireSession("admin");
    const row = demoUsers.find((user) => user.id === id);
    const user = row && adminUserSummary(row);
    if (!user) return null;
    const tracks = demoTracks.filter((track) => track.artist_user_id === id).slice(0, 6).map((track) => ({ id: track.id, title: track.title, status: track.status, createdAt: track.created_at }));
    const orders = demoOrders.filter((order) => order.buyer_user_id === id).slice(0, 6).map((order) => ({
      id: order.id, createdAt: order.created_at, amountCents: Math.round(order.amount_paid * 100), currency: order.currency,
      ...purchaseStates({ ...order, status: order.order_status, amount_cents: Math.round(order.amount_paid * 100) }, null, {
        title: demoTracks.find((track) => track.id === order.track_id)?.title,
        licenseName: demoLicenseTypes.find((license) => license.id === order.license_type_id)?.name
      })
    }));
    const profile = user.role === "artist" ? artistProfiles.find((item) => item.user_id === id) : user.role === "buyer" ? buyerProfiles.find((item) => item.user_id === id) : null;
    return {
      user, profile: profile ? user.role === "artist" ? { label: "Artist name", value: "artist_name" in profile ? profile.artist_name : "" } : { label: "Company", value: "company_name" in profile ? profile.company_name : "" } : null,
      profileSource: "available", recordsSource: "available", recordCount: user.role === "artist" ? tracks.length : user.role === "buyer" ? orders.length : 0,
      tracks, orders
    };
  }

  await requireAccountScope("admin");
  if (!ADMIN_USER_UUID.test(id)) return null;
  const supabase = await createPrivilegedSupabaseClient();
  const result = await supabase.from("user_profiles").select("id,full_name,email,role,created_at").eq("id", id).maybeSingle();
  if (result.error) throw new Error("Unable to load user. Please retry.");
  const user = result.data && adminUserSummary(result.data);
  if (!user) return null;
  if (user.role === "admin" || user.role === null) return { user, profile: null, profileSource: "available", recordsSource: "available", recordCount: 0, tracks: [], orders: [] };

  if (user.role === "artist") {
    const [profileResult, countResult, tracksResult] = await Promise.all([
      supabase.from("artist_profiles").select("artist_name").eq("user_id", id).maybeSingle(),
      supabase.from("tracks").select("id", { count: "exact", head: true }).eq("artist_user_id", id),
      supabase.from("tracks").select("id,title,status,created_at").eq("artist_user_id", id).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(6)
    ]);
    return {
      user,
      profile: profileResult.error || !profileResult.data ? null : { label: "Artist name", value: profileResult.data.artist_name },
      profileSource: profileResult.error ? "unavailable" : "available",
      recordsSource: tracksResult.error ? "unavailable" : countResult.error ? "partial" : "available",
      recordCount: countResult.error ? null : countResult.count,
      tracks: tracksResult.error ? [] : (tracksResult.data || []).map((track) => ({ id: track.id, title: track.title, status: track.status, createdAt: track.created_at })),
      orders: []
    };
  }

  const [profileResult, countResult, ordersResult] = await Promise.all([
    supabase.from("buyer_profiles").select("company_name").eq("user_id", id).maybeSingle(),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("buyer_user_id", id),
    supabase.from("orders").select("id,buyer_user_id,track_id,license_type_id,status,created_at,paid_at,refunded_at,checkout_created_at,amount_cents,currency,agreement_generation_error").eq("buyer_user_id", id).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(6)
  ]);
  const orderRows = ordersResult.error ? [] : ordersResult.data || [];
  const [licenseResult, trackResult, typeResult] = orderRows.length ? await Promise.all([
    supabase.from("generated_licenses")
      .select("order_id,buyer_id,track_id,license_type_id,status,generated_at,pdf_storage_path,generation_error,agreement_number,terms_snapshot_json")
      .eq("buyer_id", id)
      .in("order_id", orderRows.map((order) => order.id)),
    supabase.from("tracks").select("id,title").in("id", orderRows.map((order) => order.track_id)),
    supabase.from("license_types").select("id,name").in("id", orderRows.map((order) => order.license_type_id))
  ]) : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
  return {
    user,
    profile: profileResult.error || !profileResult.data ? null : { label: "Company", value: profileResult.data.company_name },
    profileSource: profileResult.error ? "unavailable" : "available",
    recordsSource: ordersResult.error ? "unavailable" : countResult.error || licenseResult.error || trackResult.error || typeResult.error ? "partial" : "available",
    recordCount: countResult.error ? null : countResult.count,
    tracks: [],
    orders: ordersResult.error ? [] : orderRows.map((order) => ({
      id: order.id, createdAt: order.created_at, amountCents: order.amount_cents, currency: order.currency,
      ...purchaseStates(order, licenseResult.error ? null : (licenseResult.data || []).find((license) => license.order_id === order.id) || null, {
        title: (trackResult.data || []).find((track) => track.id === order.track_id)?.title,
        licenseName: (typeResult.data || []).find((type) => type.id === order.license_type_id)?.name
      }),
      ...(licenseResult.error ? { license: "Unavailable · retry", agreement: "Unavailable · retry" } : {})
    }))
  };
}
