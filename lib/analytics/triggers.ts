import type { BrowserEvent, EventProperties } from "./schema.ts";
export type BrowserCapture = <E extends BrowserEvent>(event: E, properties: EventProperties<E>) => void;
export type PreviewSurface = "catalog" | "track_detail" | "buyer_workspace";
export function previewTracker(capture: BrowserCapture) {
  const played = new Set<string>();
  let failed = false;
  return {
    requested() { failed = false; },
    playing(trackId: string, surface: PreviewSurface = "buyer_workspace") {
      if (played.has(trackId)) return;
      played.add(trackId);
      capture("track_preview_started", { track_id: trackId, surface });
    },
    failed() {
      if (failed) return;
      failed = true;
      capture("funnel_step_failed", { step: "preview", error_code: "playback_failed", retryable: true });
    }
  };
}
export function submissionTracker(capture: BrowserCapture, surface: "submission_create" | "submission_edit") {
  let attempt: string | undefined;
  return { start() { if (!attempt) { attempt = crypto.randomUUID(); capture("submission_started", { submission_attempt_id: attempt, surface }); } return attempt; } };
}
export function submissionCompleted(status: string, previousStatus?: string) {
  return status === "pending_review" && previousStatus !== "pending_review";
}
export function selectionMethod(explicit: unknown): "explicit" | "default_accepted" {
  return explicit === "explicit" ? "explicit" : "default_accepted";
}
