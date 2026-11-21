import { catalogStates } from "@/lib/catalog/contract";

export type ReviewQueueTab = "track" | "catalog";
export type CatalogQueueContext = { filter: string; page: number };

export function catalogQueueContext(status?: string | null, rawPage?: string | null): CatalogQueueContext {
  const filter = status === "all" ? "" : status === "not_started" ? status
    : catalogStates.find(state => state === status) ?? "submitted";
  const page = Number(rawPage);
  return { filter, page: Number.isInteger(page) && page >= 1 && page <= 10_000 ? page : 1 };
}

export function reviewQueueRecordId(value?: string | null) {
  return typeof value === "string" && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value)
    ? value.toLowerCase() : undefined;
}

export function reviewQueueRecordAnchor(id: string) {
  return `review-queue-record-${id}`;
}

export function reviewQueueHref(tab: ReviewQueueTab, context: CatalogQueueContext, record?: string) {
  const params = queueContextParams(context);
  if (tab === "catalog") params.set("view", "catalog");
  const id = reviewQueueRecordId(record);
  if (id) params.set("record", id);
  const query = params.toString();
  return "/admin/review-queue" + (query ? "?" + query : "");
}

export function catalogReviewHref(track: string, context: CatalogQueueContext, fromTrackQueue = false) {
  const params = queueContextParams(context);
  params.set("track", track);
  if (fromTrackQueue) params.set("from", "track-queue");
  return "/admin/catalog?" + params.toString();
}

export function trackReviewHref(track: string, context: CatalogQueueContext) {
  const params = queueContextParams(context);
  params.set("from", "review-queue");
  return `/admin/tracks/${encodeURIComponent(track)}?${params}`;
}

function queueContextParams({ filter, page }: CatalogQueueContext) {
  const params = new URLSearchParams();
  if (filter !== "submitted") params.set("status", filter || "all");
  if (page !== 1) params.set("page", String(page));
  return params;
}
