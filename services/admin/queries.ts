import { adminFlags as demoFlags, demoUsers, licenseTypes as demoLicenseTypes, orders as demoOrders, tracks as demoTracks } from "@/lib/demo-data";
import { env, hasSupabaseEnv } from "@/lib/env";
import { hasAgreementBeenGenerated, hasSecureAgreementDelivery, isAgreementDeliveryBlocked } from "@/lib/orders";
import { getPublicStorageUrl, storageBuckets } from "@/lib/storage";
import { withTrackAudioAccess } from "@/services/storage/server";
import { createPrivilegedSupabaseClient } from "@/services/supabase/privileged";
import { isMissingColumnError, isMissingRelationError, warnSchemaFallbackOnce } from "@/services/supabase/schema-compat";
import type { AdminFlagSeverity, LicenseType, OrderStatus, RightsHolder, Track, TrackStatus, VerificationStatus } from "@/types/models";

interface AdminReviewQueueItem {
  id: string;
  title: string;
  artist_name: string;
  genre: string;
  subgenre: string;
  mood: string[];
  bpm: number;
  duration_seconds: number;
  explicit: boolean;
  status: TrackStatus;
  featured: boolean;
  created_at: string;
  cover_art_url?: string | null;
  rights_holder_count: number;
  rights_split_total: number;
  open_flag_count: number;
  review_note_count: number;
  highest_flag_severity: AdminFlagSeverity | null;
  verification_status: VerificationStatus;
  open_flag_types: string[];
}

interface AdminRecentOrder {
  id: string;
  buyer_name: string;
  track_title: string;
  license_name: string;
  amount_paid: number;
  order_status: OrderStatus;
  created_at: string;
}

export async function getAdminDashboardData() {
  if (!hasSupabaseEnv || env.demoMode) {
    const pendingTracks = buildDemoReviewQueue();
    const recentOrders = demoOrders.slice(0, 5).map((order) => ({
      id: order.id,
      buyer_name: demoUsers.find((user) => user.id === order.buyer_user_id)?.full_name || "Buyer",
      track_title: demoTracks.find((track) => track.id === order.track_id)?.title || "Track",
      license_name: demoLicenseTypes.find((license) => license.id === order.license_type_id)?.name || "License",
      amount_paid: order.amount_paid,
      order_status: order.order_status,
      created_at: order.created_at
    }));
    const openFlags = demoFlags.filter((flag) => flag.status === "open");

    return {
      totalUsers: demoUsers.length,
      totalTracks: demoTracks.length,
      pendingReviews: pendingTracks.length,
      totalOrders: demoOrders.length,
      openFlags: openFlags.length,
      approvedTracks: demoTracks.filter((track) => track.status === "approved").length,
      grossVolume: demoOrders.reduce((sum, order) => sum + order.amount_paid, 0),
      pendingTracks: pendingTracks.slice(0, 4),
      recentOrders,
      flagSummary: buildFlagSummary(openFlags.map((flag) => (flag.severity || "medium") as AdminFlagSeverity))
    };
  }

  const supabase = createPrivilegedSupabaseClient();

  const [usersResult, tracksResult, rightsResult, flagsResult, reviewNotesResult, profilesResult, ordersResult] = await Promise.all([
    supabase.from("user_profiles").select("id"),
    supabase
      .from("tracks")
      .select("id, title, artist_user_id, genre, subgenre, moods, bpm, duration_seconds, explicit, status, featured, created_at, cover_art_path"),
    supabase.from("rights_holders").select("track_id, ownership_percent"),
    supabase.from("admin_flags").select("id, track_id, status, severity, flag_type, created_at"),
    supabase.from("review_notes").select("id, track_id"),
    supabase.from("artist_profiles").select("user_id, artist_name, verification_status"),
    supabase
      .from("orders")
      .select(
        `
          id,
          amount_cents,
          buyer_user_id,
          status,
          created_at,
          license_type_id,
          tracks (
            title
          ),
          license_types (
            name
          )
        `
      )
      .order("created_at", { ascending: false })
  ]);

  const pendingTracks = buildReviewQueueItems({
    tracks: tracksResult.data || [],
    rightsHolders: rightsResult.data || [],
    flags: flagsResult.data || [],
    reviewNotes: reviewNotesResult.data || [],
    profiles: profilesResult.data || []
  }).slice(0, 4);

  const orderRows = ordersResult.data || [];
  const buyerNameById = await getUserNameMap(Array.from(new Set(orderRows.map((order: any) => order.buyer_user_id).filter(Boolean))));
  const openFlags = (flagsResult.data || []).filter((flag: any) => flag.status === "open");

  return {
    totalUsers: (usersResult.data || []).length,
    totalTracks: (tracksResult.data || []).length,
    pendingReviews: pendingTracks.length || (tracksResult.data || []).filter((track: any) => track.status === "pending_review").length,
    totalOrders: orderRows.length,
    openFlags: openFlags.length,
    approvedTracks: (tracksResult.data || []).filter((track: any) => track.status === "approved").length,
    grossVolume: orderRows.reduce((sum: number, order: any) => sum + Number(order.amount_cents || 0) / 100, 0),
    pendingTracks,
    recentOrders: orderRows.slice(0, 5).map((order: any) => ({
      id: order.id,
      buyer_name: buyerNameById.get(order.buyer_user_id) || "Buyer",
      track_title: order.tracks?.title || "Track",
      license_name: order.license_types?.name || "License",
      amount_paid: Number(order.amount_cents || 0) / 100,
      order_status: order.status,
      created_at: order.created_at
    })),
    flagSummary: buildFlagSummary(openFlags.map((flag: any) => (flag.severity || "medium") as AdminFlagSeverity))
  };
}

export async function getAdminReviewQueue() {
  if (!hasSupabaseEnv || env.demoMode) {
    return buildDemoReviewQueue();
  }

  const supabase = createPrivilegedSupabaseClient();

  const [tracksResult, rightsResult, flagsResult, reviewNotesResult, profilesResult] = await Promise.all([
    supabase
      .from("tracks")
      .select("id, title, artist_user_id, genre, subgenre, moods, bpm, duration_seconds, explicit, status, featured, created_at, cover_art_path")
      .eq("status", "pending_review"),
    supabase.from("rights_holders").select("track_id, ownership_percent"),
    supabase.from("admin_flags").select("id, track_id, status, severity, flag_type, created_at"),
    supabase.from("review_notes").select("id, track_id"),
    supabase.from("artist_profiles").select("user_id, artist_name, verification_status")
  ]);

  return buildReviewQueueItems({
    tracks: tracksResult.data || [],
    rightsHolders: rightsResult.data || [],
    flags: flagsResult.data || [],
    reviewNotes: reviewNotesResult.data || [],
    profiles: profilesResult.data || []
  });
}

export async function getAdminTracks() {
  if (!hasSupabaseEnv || env.demoMode) {
    return demoTracks.map((track) => ({
      id: track.id,
      title: track.title,
      artist_name: track.artist_name,
      genre: track.genre,
      status: track.status,
      featured: track.featured
    }));
  }

  const supabase = createPrivilegedSupabaseClient();

  const [{ data: tracks }, { data: profiles }] = await Promise.all([
    supabase.from("tracks").select("id, title, artist_user_id, genre, status, featured").order("created_at", { ascending: false }),
    supabase.from("artist_profiles").select("user_id, artist_name")
  ]);
  const artistNameByUserId = new Map((profiles || []).map((row: any) => [row.user_id, row.artist_name]));

  return (tracks || []).map((track: any) => ({
    ...track,
    artist_name: artistNameByUserId.get(track.artist_user_id) || "Artist"
  }));
}

export async function getAdminTrackById(trackId: string) {
  if (!hasSupabaseEnv || env.demoMode) {
    const track = demoTracks.find((item) => item.id === trackId) || null;
    if (!track) return null;
    return {
      track,
      flags: demoFlags
        .filter((flag) => flag.track_id === trackId)
        .map((flag) => ({ ...flag, severity: (flag.severity || "medium") as AdminFlagSeverity, created_by_name: "Admin reviewer" })),
      reviewNotes: [],
      auditLog: []
    };
  }

  const supabase = createPrivilegedSupabaseClient();

  const [{ data: trackRow }, { data: profiles }, { data: flags }, { data: reviewNotes }, { data: auditLog }] = await Promise.all([
    supabase
      .from("tracks")
      .select(
        `
          *,
          rights_holders (*),
          track_license_options (
            id,
            price_cents,
            active,
            license_types (
              id,
              name,
              slug,
              description,
              exclusive,
              default_price_cents,
              terms_summary,
              active
            )
          )
        `
      )
      .eq("id", trackId)
      .maybeSingle(),
    supabase.from("artist_profiles").select("user_id, artist_name"),
    supabase.from("admin_flags").select("*").eq("track_id", trackId).order("created_at", { ascending: false }),
    supabase.from("review_notes").select("*").eq("track_id", trackId).order("created_at", { ascending: false }),
    supabase.from("track_audit_log").select("*").eq("track_id", trackId).order("created_at", { ascending: false })
  ]);

  if (!trackRow) return null;

  const artistNameByUserId = new Map((profiles || []).map((row: any) => [row.user_id, row.artist_name]));
  const userIds = Array.from(
    new Set(
      [...(flags || []).map((flag: any) => flag.created_by), ...(reviewNotes || []).map((note: any) => note.author_id), ...(auditLog || []).map((event: any) => event.actor_id)].filter(
        Boolean
      )
    )
  ) as string[];
  const userNameById = await getUserNameMap(userIds);

  return {
    track: await withTrackAudioAccess(mapTrack(trackRow, artistNameByUserId.get(trackRow.artist_user_id) || "Artist"), "full"),
    flags: (flags || []).map((flag: any) => ({
      ...flag,
      severity: (flag.severity || "medium") as AdminFlagSeverity,
      created_by_name: userNameById.get(flag.created_by) || null
    })),
    reviewNotes: (reviewNotes || []).map((note: any) => ({
      ...note,
      author_name: userNameById.get(note.author_id) || null
    })),
    auditLog: (auditLog || []).map((event: any) => ({
      ...event,
      actor_name: event.actor_id ? userNameById.get(event.actor_id) || null : null
    }))
  };
}

export async function getAdminAnalytics() {
  if (!hasSupabaseEnv || env.demoMode) {
    const totalOrders = demoOrders.length;
    const grossVolume = demoOrders.reduce((sum, order) => sum + order.amount_paid, 0);
    const approvedTracks = demoTracks.filter((track) => track.status === "approved").length;
    const pendingTracks = demoTracks.filter((track) => track.status === "pending_review").length;
    return {
      conversionLabel: `${approvedTracks}/${demoTracks.length}`,
      averageOrderValue: totalOrders ? grossVolume / totalOrders : 0,
      approvalVelocity: pendingTracks ? "Pending queue active" : "Queue clear"
    };
  }

  const supabase = createPrivilegedSupabaseClient();

  const [tracksResult, ordersResult] = await Promise.all([supabase.from("tracks").select("status"), supabase.from("orders").select("amount_cents")]);

  const tracks = tracksResult.data || [];
  const orders = ordersResult.data || [];
  const approvedTracks = tracks.filter((track: any) => track.status === "approved").length;
  const pendingTracks = tracks.filter((track: any) => track.status === "pending_review").length;
  const grossVolume = orders.reduce((sum: number, order: any) => sum + Number(order.amount_cents || 0) / 100, 0);

  return {
    conversionLabel: `${approvedTracks}/${tracks.length || 0}`,
    averageOrderValue: orders.length ? grossVolume / orders.length : 0,
    approvalVelocity: pendingTracks ? `${pendingTracks} awaiting review` : "Queue clear"
  };
}

export async function getAdminComplianceFlags() {
  if (!hasSupabaseEnv || env.demoMode) {
    return demoFlags.map((flag) => ({
      ...flag,
      severity: (flag.severity || "medium") as AdminFlagSeverity,
      created_by_name: "Admin reviewer",
      track_title: demoTracks.find((track) => track.id === flag.track_id)?.title || "Track"
    }));
  }

  const supabase = createPrivilegedSupabaseClient();

  const { data } = await supabase
    .from("admin_flags")
    .select(
      `
        id,
        flag_type,
        severity,
        notes,
        status,
        created_by,
        created_at,
        track_id,
        tracks (
          title
        )
      `
    )
    .order("created_at", { ascending: false });

  const userNameById = await getUserNameMap(Array.from(new Set((data || []).map((flag: any) => flag.created_by).filter(Boolean))));

  return (data || []).map((flag: any) => ({
    ...flag,
    severity: (flag.severity || "medium") as AdminFlagSeverity,
    created_by_name: userNameById.get(flag.created_by) || null,
    track_title: flag.tracks?.title || "Track"
  }));
}

export async function getAdminOrders() {
  if (!hasSupabaseEnv || env.demoMode) {
    return demoOrders.map((order) => ({
      ...order,
      buyer_name: demoUsers.find((user) => user.id === order.buyer_user_id)?.full_name || "Buyer",
      track_title: demoTracks.find((track) => track.id === order.track_id)?.title || "Track",
      license_name: demoLicenseTypes.find((license) => license.id === order.license_type_id)?.name || "License",
      recent_activity: []
    }));
  }

  const supabase = createPrivilegedSupabaseClient();
  const primaryOrders = await supabase
    .from("orders")
    .select(
      `
        id,
        amount_cents,
        buyer_user_id,
        agreement_url,
        status,
        stripe_checkout_session_id,
        stripe_payment_intent_id,
        checkout_created_at,
        paid_at,
        agreement_generated_at,
        agreement_path,
        agreement_generation_error,
        fulfilled_at,
        refunded_at,
        last_webhook_event_type,
        last_webhook_processed_at,
        last_webhook_error,
        created_at,
        track_id,
        license_type_id,
        tracks (
          title
        ),
        license_types (
          name
        )
      `
    )
    .order("created_at", { ascending: false });

  let orders = (primaryOrders.data || []) as any[];
  let schemaDegraded = false;

  if (primaryOrders.error) {
    if (!isMissingColumnError(primaryOrders.error, ["agreement_path", "agreement_generation_error", "last_webhook_event_type"])) {
      throw new Error(primaryOrders.error.message);
    }

    warnSchemaFallbackOnce(
      "admin-orders-read",
      "Admin order lifecycle metadata is not fully available yet; order cards will show a reduced view until migration 0010 is applied.",
      primaryOrders.error
    );

    const fallback = await supabase
      .from("orders")
      .select(
        `
          id,
          amount_cents,
          buyer_user_id,
          agreement_url,
          status,
          stripe_checkout_session_id,
          stripe_payment_intent_id,
          checkout_created_at,
          paid_at,
          agreement_generated_at,
          fulfilled_at,
          refunded_at,
          created_at,
          track_id,
          license_type_id,
          tracks (
            title
          ),
          license_types (
            name
          )
        `
      )
      .order("created_at", { ascending: false });

    if (fallback.error) {
      throw new Error(fallback.error.message);
    }

    orders = (fallback.data || []).map((order: any) => ({
      ...order,
      agreement_path: null,
      agreement_generation_error: null,
      last_webhook_event_type: null,
      last_webhook_processed_at: null,
      last_webhook_error: null
    }));
    schemaDegraded = true;
  }

  const orderIds = Array.from(new Set(orders.map((order: any) => order.id).filter(Boolean)));
  const buyerNameById = await getUserNameMap(Array.from(new Set(orders.map((order: any) => order.buyer_user_id).filter(Boolean))));
  let activityRows: any[] = [];
  let activityDegraded = false;

  if (orderIds.length) {
    const activityResult = await supabase
      .from("order_activity_log")
      .select("id, order_id, event_type, message, created_at")
      .in("order_id", orderIds)
      .order("created_at", { ascending: false });

    if (activityResult.error) {
      if (!isMissingRelationError(activityResult.error, "order_activity_log")) {
        throw new Error(activityResult.error.message);
      }

      warnSchemaFallbackOnce(
        "admin-order-activity-read",
        "order_activity_log is not available yet; admin order cards will omit recent activity until migration 0010 is applied.",
        activityResult.error
      );
      activityDegraded = true;
    } else {
      activityRows = activityResult.data || [];
    }
  }

  const activityByOrderId = new Map<string, Array<{ id: string; event_type: string; message: string | null; created_at: string }>>();

  for (const row of activityRows) {
    const current = activityByOrderId.get(row.order_id) || [];
    if (current.length < 3) {
      current.push(row);
      activityByOrderId.set(row.order_id, current);
    }
  }

  return orders.map((order: any) => ({
    ...order,
    amount_paid: Number(order.amount_cents || 0) / 100,
    order_status: order.status,
    agreement_generated: hasAgreementBeenGenerated(order),
    agreement_ready: hasSecureAgreementDelivery(order),
    agreement_delivery_blocked: isAgreementDeliveryBlocked(order),
    schema_degraded: schemaDegraded,
    activity_degraded: activityDegraded,
    degraded_messages: [
      ...(schemaDegraded ? ["Extended fulfillment metadata is unavailable until migration 0010 is applied."] : []),
      ...(activityDegraded ? ["Recent order activity is unavailable until order_activity_log is live."] : []),
      ...(order.agreement_generated_at && !order.agreement_path
        ? ["Agreement generation completed, but secure buyer delivery remains blocked until agreement_path metadata is available."]
        : [])
    ],
    buyer_name: buyerNameById.get(order.buyer_user_id) || "Buyer",
    track_title: order.tracks?.title || "Track",
    license_name: order.license_types?.name || "License",
    recent_activity: activityByOrderId.get(order.id) || []
  }));
}

export async function getAdminUsers() {
  if (!hasSupabaseEnv || env.demoMode) {
    return demoUsers;
  }

  const supabase = createPrivilegedSupabaseClient();

  const { data } = await supabase.from("user_profiles").select("id, full_name, email, role, created_at").order("created_at", { ascending: false });
  return data || [];
}

function buildDemoReviewQueue(): AdminReviewQueueItem[] {
  const rightsByTrackId = new Map<string, RightsHolder[]>(
    demoTracks.map((track) => [track.id, track.rights_holders || []])
  );

  return demoTracks
    .filter((track) => track.status === "pending_review")
    .map<AdminReviewQueueItem>((track) => {
      const trackFlags = demoFlags.filter((flag) => flag.track_id === track.id && flag.status === "open");
      const holders = rightsByTrackId.get(track.id) || [];

      return {
        id: track.id,
        title: track.title,
        artist_name: track.artist_name,
        genre: track.genre,
        subgenre: track.subgenre,
        mood: track.mood,
        bpm: track.bpm,
        duration_seconds: track.duration_seconds,
        explicit: track.explicit,
        status: track.status,
        featured: track.featured,
        created_at: track.created_at,
        cover_art_url: track.cover_art_url,
        rights_holder_count: holders.length,
        rights_split_total: holders.reduce((sum, holder) => sum + holder.ownership_percent, 0),
        open_flag_count: trackFlags.length,
        review_note_count: 0,
        highest_flag_severity: resolveHighestSeverity(trackFlags.map((flag) => (flag.severity || "medium") as AdminFlagSeverity)),
        verification_status: "pending",
        open_flag_types: trackFlags.map((flag) => flag.flag_type)
      };
    })
    .sort(sortQueueByAttention);
}

function buildReviewQueueItems({
  tracks,
  rightsHolders,
  flags,
  reviewNotes,
  profiles
}: {
  tracks: any[];
  rightsHolders: any[];
  flags: any[];
  reviewNotes: any[];
  profiles: any[];
}): AdminReviewQueueItem[] {
  const artistProfileByUserId = new Map(
    profiles.map((profile: any) => [profile.user_id, { artist_name: profile.artist_name, verification_status: (profile.verification_status || "unverified") as VerificationStatus }])
  );
  const rightsByTrackId = new Map<string, any[]>();
  for (const holder of rightsHolders) {
    const list = rightsByTrackId.get(holder.track_id) || [];
    list.push(holder);
    rightsByTrackId.set(holder.track_id, list);
  }

  const flagsByTrackId = new Map<string, any[]>();
  for (const flag of flags) {
    const list = flagsByTrackId.get(flag.track_id) || [];
    list.push(flag);
    flagsByTrackId.set(flag.track_id, list);
  }

  const notesCountByTrackId = new Map<string, number>();
  for (const note of reviewNotes) {
    notesCountByTrackId.set(note.track_id, (notesCountByTrackId.get(note.track_id) || 0) + 1);
  }

  return tracks
    .filter((track: any) => track.status === "pending_review")
    .map<AdminReviewQueueItem>((track: any) => {
      const holders = rightsByTrackId.get(track.id) || [];
      const openFlags = (flagsByTrackId.get(track.id) || []).filter((flag: any) => flag.status === "open");
      const profile = artistProfileByUserId.get(track.artist_user_id);
      const verificationStatus = (profile?.verification_status || "unverified") as VerificationStatus;

      return {
        id: track.id,
        title: track.title,
        artist_name: profile?.artist_name || "Artist",
        genre: track.genre,
        subgenre: track.subgenre,
        mood: track.moods || [],
        bpm: track.bpm,
        duration_seconds: track.duration_seconds,
        explicit: track.explicit,
        status: track.status as TrackStatus,
        featured: Boolean(track.featured),
        created_at: track.created_at,
        cover_art_url: getPublicStorageUrl(storageBuckets.coverArt, track.cover_art_path),
        rights_holder_count: holders.length,
        rights_split_total: holders.reduce((sum: number, holder: any) => sum + Number(holder.ownership_percent || 0), 0),
        open_flag_count: openFlags.length,
        review_note_count: notesCountByTrackId.get(track.id) || 0,
        highest_flag_severity: resolveHighestSeverity(openFlags.map((flag: any) => (flag.severity || "medium") as AdminFlagSeverity)),
        verification_status: verificationStatus,
        open_flag_types: openFlags.map((flag: any) => flag.flag_type)
      };
    })
    .sort(sortQueueByAttention);
}

function buildFlagSummary(severities: AdminFlagSeverity[]) {
  const counts = new Map<AdminFlagSeverity, number>([
    ["critical", 0],
    ["high", 0],
    ["medium", 0],
    ["low", 0]
  ]);

  for (const severity of severities) {
    counts.set(severity, (counts.get(severity) || 0) + 1);
  }

  return (["critical", "high", "medium", "low"] as AdminFlagSeverity[]).map((severity) => ({
    severity,
    count: counts.get(severity) || 0
  }));
}

function resolveHighestSeverity(severities: AdminFlagSeverity[]) {
  if (!severities.length) return null;
  const rank = { low: 0, medium: 1, high: 2, critical: 3 };
  return severities.reduce((highest, current) => (rank[current] > rank[highest] ? current : highest), severities[0]);
}

function sortQueueByAttention(a: AdminReviewQueueItem, b: AdminReviewQueueItem) {
  const severityRank = { low: 0, medium: 1, high: 2, critical: 3 };
  const severityDelta = (severityRank[b.highest_flag_severity || "low"] || 0) - (severityRank[a.highest_flag_severity || "low"] || 0);
  if (severityDelta !== 0) return severityDelta;
  if (b.open_flag_count !== a.open_flag_count) return b.open_flag_count - a.open_flag_count;
  if (b.review_note_count !== a.review_note_count) return b.review_note_count - a.review_note_count;
  return b.created_at.localeCompare(a.created_at);
}

function mapTrack(row: any, artistName: string): Track {
  const rightsHolders: RightsHolder[] = (row.rights_holders || []).map((holder: any) => ({
    id: holder.id,
    track_id: holder.track_id,
    name: holder.name,
    email: holder.email,
    role_type: holder.role_type,
    ownership_percent: Number(holder.ownership_percent),
    approval_status: holder.approval_status,
    created_at: holder.created_at,
    updated_at: holder.updated_at
  }));

  const licenseOptions = (row.track_license_options || [])
    .filter((option: any) => option.license_types)
    .map((option: any) => {
      const license = option.license_types as LicenseType;
      return {
        ...license,
        base_price: Number((option.license_types as any).default_price_cents || 0) / 100,
        price_override: option.price_cents == null ? null : Number(option.price_cents) / 100
      };
    });

  return {
    id: row.id,
    artist_user_id: row.artist_user_id,
    artist_name: artistName,
    title: row.title,
    slug: row.slug,
    description: row.description || "",
    genre: row.genre,
    subgenre: row.subgenre,
    mood: row.moods || [],
    bpm: row.bpm,
    key: row.musical_key,
    duration_seconds: row.duration_seconds,
    instrumental: row.instrumental,
    vocals: row.vocals,
    explicit: row.explicit,
    lyrics: row.lyrics,
    release_year: row.release_year,
    cover_art_path: row.cover_art_path,
    audio_file_path: row.audio_file_path,
    preview_file_path: row.preview_file_path,
    waveform_path: row.waveform_path,
    waveform_preview_url: getPublicStorageUrl(storageBuckets.trackPreviews, row.waveform_path),
    audio_file_url: null,
    cover_art_url: getPublicStorageUrl(storageBuckets.coverArt, row.cover_art_path),
    status: row.status as TrackStatus,
    featured: row.featured,
    approved_at: row.approved_at,
    approved_by: row.approved_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    rights_holders: rightsHolders,
    license_options: licenseOptions
  };
}

async function getUserNameMap(userIds: string[]) {
  if (!userIds.length || !hasSupabaseEnv || env.demoMode) {
    return new Map<string, string>();
  }

  const supabase = createPrivilegedSupabaseClient();

  const { data } = await supabase.from("user_profiles").select("id, full_name, email").in("id", userIds);
  return new Map((data || []).map((user: any) => [user.id, user.full_name || user.email]));
}
