import { z } from "zod";

const id = z.string().uuid();
const license = z.enum(["digital-campaign", "broadcast", "exclusive-buyout"]);
const surface = z.enum(["submission_create", "submission_edit"]);
export const eventSchemas = {
  email_confirmed: z.object({}),
  artist_profile_completed: z.object({}),
  upload_completed: z.object({ track_id: id, asset_id: id }),
  rights_reviewed: z.object({ track_id: id, state: z.enum(["clarification","approved","rejected","disputed","expired","revoked"]) }),
  rights_approved: z.object({ track_id: id }),
  catalog_reviewed: z.object({ track_id: id, state: z.enum(["approved","changes_requested","rejected"]) }),
  catalog_approved: z.object({ track_id: id }),
  catalog_published: z.object({ track_id: id }),
  buyer_accepted: z.object({ order_id: id, track_id: id }),
  license_issued: z.object({ order_id: id, track_id: id }),
  asset_delivery_completed: z.object({ order_id: id, outcome: z.literal("stream_exhausted") }),
  asset_delivery_failed: z.object({ order_id: id, outcome: z.enum(["interrupted","revoked","expired","storage_failed"]) }),
  refund_verified: z.object({ order_id: id }),
  dispute_verified: z.object({ order_id: id }),
  subscription_activity: z.object({ kind: z.literal("administrative_observation") }),
  admin_operation: z.object({ module: z.enum(["users","permissions","support","integrity","deals","subscriptions","settings","organizations","incidents","domain"]) }),
  operational_failure: z.object({ system: z.enum(["media","checkout","delivery","finance","analytics"]), category: z.enum(["processing_failed","retry_exhausted","unavailable"]) }),
  marketplace_inquiry: z.object({ track_id: id, deal_id: id, order_id: id.optional() }),
  marketplace_quote: z.object({ track_id: id, deal_id: id, order_id: id.optional() }),
  marketplace_checkout: z.object({ track_id: id, deal_id: id, order_id: id }),
  marketplace_license: z.object({ track_id: id, deal_id: id, order_id: id }),
  signup_completed: z.object({ confirmation_required: z.boolean() }),
  onboarding_started: z.object({}),
  onboarding_completed: z.object({}),
  submission_started: z.object({ submission_attempt_id: id, surface }),
  submission_completed: z.object({ submission_attempt_id: id.optional(), track_id: id, is_resubmission: z.boolean() }),
  catalog_searched: z.object({ search_id: id, result_count: z.number().int().min(0).max(100000), has_query: z.boolean(), filter_count: z.number().int().min(0).max(17), filter_types: z.array(z.enum(["genre", "mood", "licenseType", "vocalProfile", "explicitFilter", "priceBand", "minBpm", "maxBpm", "subgenre", "key", "language", "minDuration", "maxDuration", "artist", "title", "keyword", "savedOnly"])).max(17), sort: z.enum(["featured", "price-low", "tempo-high", "relevance", "title", "newest", "bpm", "duration"]) }),
  track_preview_started: z.object({ track_id: id, surface: z.enum(["catalog", "track_detail", "buyer_workspace"]) }),
  license_selected: z.object({ track_id: id, license_type: license, selection_method: z.enum(["explicit", "default_accepted"]) }),
  checkout_started: z.object({ order_id: id, track_id: id, license_type: license, checkout_attempt_id: id }),
  purchase_verified: z.object({ order_id: id, track_id: id, license_type: license, payment_mode: z.enum(["live", "test"]) }),
  funnel_step_failed: z.object({ step: z.enum(["signup", "onboarding", "submission", "preview", "checkout"]), error_code: z.enum(["validation", "save_failed", "upload_failed", "playback_failed", "checkout_failed"]), retryable: z.boolean() })
} as const;
export type EventName = keyof typeof eventSchemas;
export type EventProperties<E extends EventName> = z.infer<(typeof eventSchemas)[E]>;
export type AnalyticsRole = "artist" | "buyer" | "admin" | "unassigned";
export type Actor = { id: string; role: AnalyticsRole };
export const browserEvents = ["onboarding_started", "submission_started", "catalog_searched", "track_preview_started", "license_selected", "funnel_step_failed"] as const;
export type BrowserEvent = typeof browserEvents[number];

// Zod object schemas strip unknown keys. Every accepted string is an enum or UUID;
// no free text, generic metadata, URLs, SDK properties, or nested payloads exist.
export function filterProperties<E extends EventName>(event: E, input: unknown): EventProperties<E> | null {
  if (!Object.hasOwn(eventSchemas, event)) return null;
  const result = eventSchemas[event].safeParse(input);
  return result.success ? result.data as EventProperties<E> : null;
}
export function validActor(actor: Actor): boolean {
  return id.safeParse(actor.id).success && ["artist", "buyer", "admin", "unassigned"].includes(actor.role);
}
export function browserEventAllowed(event: string, role: AnalyticsRole, properties: unknown): event is BrowserEvent {
  if (!(browserEvents as readonly string[]).includes(event)) return false;
  if (event === "onboarding_started") return role === "artist" || role === "buyer";
  if (event === "submission_started") return role === "artist";
  if (event === "funnel_step_failed") {
    const p = filterProperties(event, properties);
    return !!p && (role === "artist" ? ["submission", "onboarding"].includes(p.step) : role === "buyer" && ["preview", "onboarding"].includes(p.step));
  }
  return role === "buyer";
}
