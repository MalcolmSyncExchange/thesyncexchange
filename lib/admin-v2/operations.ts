export type AdminAttentionPriority = "Critical" | "Needs attention" | "Review" | "Informational";
export type AdminAttentionSource = "track" | "flag" | "order";

export interface AdminAttentionItem {
  key: string;
  source: AdminAttentionSource;
  entity: string;
  entityId: string;
  title: string;
  reason: string;
  priority: AdminAttentionPriority;
  eventAt: string;
  href: string;
}

export interface AdminOperationsInput {
  checkedAt: string;
  counts: {
    users: number | null;
    tracks: number | null;
    pendingTracks: number | null;
    orders: number | null;
    openFlags: number | null;
    orderExceptions: number | null;
  };
  pendingTracks: Array<{ id: string; title: string; created_at: string }> | null;
  openFlags: Array<{ id: string; track_id: string; flag_type: string; severity: string; created_at: string; track_title: string | null }> | null;
  orderExceptions: Array<{
    id: string;
    status: string;
    created_at: string;
    agreement_generation_error: boolean;
    agreement_generated_at: string | null;
  }> | null;
}

export interface AdminOperationsSnapshot extends AdminOperationsInput {
  items: AdminAttentionItem[];
  allAttentionSourcesAvailable: boolean;
  attentionIsClear: boolean;
  hasAnyUnavailableSource: boolean;
}

const priorityOrder: Record<AdminAttentionPriority, number> = {
  Critical: 0,
  "Needs attention": 1,
  Review: 2,
  Informational: 3
};

function flagPriority(severity: string): AdminAttentionPriority {
  if (severity === "critical") return "Critical";
  if (severity === "high") return "Needs attention";
  if (severity === "medium") return "Review";
  return "Informational";
}

function safeLabel(value: string, fallback: string): string {
  const label = value.trim().replace(/\s+/g, " ");
  return label ? label.slice(0, 100) : fallback;
}

export function buildAdminOperationsSnapshot(input: AdminOperationsInput): AdminOperationsSnapshot {
  const items: AdminAttentionItem[] = [];

  for (const track of input.pendingTracks ?? []) {
    items.push({
      key: `track:${track.id}`,
      source: "track",
      entity: "Track",
      entityId: track.id,
      title: safeLabel(track.title, "Untitled track"),
      reason: "Submitted track is waiting for review.",
      priority: "Review",
      eventAt: track.created_at,
      href: `/admin/tracks/${encodeURIComponent(track.id)}`
    });
  }

  for (const flag of input.openFlags ?? []) {
    items.push({
      key: `flag:${flag.id}`,
      source: "flag",
      entity: "Track flag",
      entityId: flag.track_id,
      title: safeLabel(flag.track_title ?? "", "Flagged track"),
      reason: `Open ${safeLabel(flag.flag_type.replace(/[_-]/g, " "), "flag")} flag needs inspection.`,
      priority: flagPriority(flag.severity),
      eventAt: flag.created_at,
      href: `/admin/tracks/${encodeURIComponent(flag.track_id)}`
    });
  }

  for (const order of input.orderExceptions ?? []) {
    // A recorded error may outlive a successful agreement or paid order. Only a
    // still-missing agreement is a current exception; webhook errors need a
    // separate authoritative resolution state before they can be triaged here.
    if (!order.agreement_generation_error || order.agreement_generated_at || order.status !== "paid") continue;
    items.push({
      key: `order:${order.id}`,
      source: "order",
      entity: "Order",
      entityId: order.id,
      title: `Order ${order.id.slice(0, 8)}`,
      reason: "Paid order has a recorded agreement-generation error. Inspect the existing order before any retry.",
      priority: "Needs attention",
      eventAt: order.created_at,
      href: `/admin/orders#order-${encodeURIComponent(order.id)}`
    });
  }

  items.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority] || a.eventAt.localeCompare(b.eventAt));

  const allAttentionSourcesAvailable = input.pendingTracks !== null && input.openFlags !== null && input.orderExceptions !== null;
  return {
    ...input,
    items,
    allAttentionSourcesAvailable,
    attentionIsClear: allAttentionSourcesAvailable && items.length === 0,
    hasAnyUnavailableSource: Object.values(input.counts).some((count) => count === null) || !allAttentionSourcesAvailable
  };
}
