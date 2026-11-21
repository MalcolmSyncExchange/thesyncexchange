import "server-only";

import { z } from "zod";
import type { ArtistMediaAsset } from "@/contracts/submission-media/profiles";
import type { UploadState } from "@/lib/media/upload-contract";
import { currentMedia } from "@/lib/media/upload-progress.mjs";
import { mediaActor, mediaRpc } from "./uploads";

type ReviewSource = Pick<ArtistMediaAsset, "id" | "accepted"> & {
  kind: "source_master";
  state: "ready";
  duration_us: number;
};

export type AdminTrackReviewMedia =
  | { status: "unavailable" }
  | {
      status: "ready";
      submission: string;
      source: ReviewSource;
      waveformUrl: string;
      originalAuthorizationPath: string;
      selection: UploadState["selection"];
    };

type ReviewState = {
  review_id: string;
  submission_id: string;
  track_id: string;
  revision: number;
  candidate_master: ArtistMediaAsset | null;
};

const uuid = z.string().uuid();
const unavailable = { status: "unavailable" } as const;

export async function getAdminTrackReviewMedia(trackId: string): Promise<AdminTrackReviewMedia> {
  if (!uuid.safeParse(trackId).success) return unavailable;

  try {
    const { client } = await mediaActor(true);
    const submission = uuid.safeParse(await mediaRpc(client, "media_upload_find", { p_track: trackId }));
    if (!submission.success) return unavailable;

    const scope = { p_submission: submission.data };
    const state = await mediaRpc<UploadState>(client, "media_upload_admin_read", scope);
    if (state.track_id !== trackId || state.submission_id !== submission.data) return unavailable;

    const { source, waveform } = currentMedia(state);
    if (source?.kind !== "source_master" || source.state !== "ready" ||
      !uuid.safeParse(source.id).success || typeof source.duration_us !== "number" ||
      !Number.isSafeInteger(source.duration_us) || source.duration_us < 1_000_000 ||
      source.duration_us > 900_000_000 ||
      waveform?.kind !== "waveform" || waveform.state !== "ready" ||
      !uuid.safeParse(waveform.id).success) {
      return unavailable;
    }

    if (state.review) {
      const review = await mediaRpc<ReviewState>(client, "media_admin_review_state", { p_review: state.review.id });
      if (review.review_id !== state.review.id || review.submission_id !== submission.data ||
        review.track_id !== trackId || review.revision !== state.revision ||
        review.candidate_master?.id !== source.id) {
        return unavailable;
      }
    }

    if (await mediaRpc(client, "media_master_can_play", { ...scope, p_asset: source.id }) !== true ||
      await mediaRpc(client, "media_upload_can_play", { ...scope, p_asset: waveform.id }) !== true) {
      return unavailable;
    }

    return {
      status: "ready",
      submission: submission.data,
      source: { id: source.id, kind: "source_master", state: "ready", duration_us: source.duration_us, accepted: source.accepted },
      waveformUrl: `/api/media/${submission.data}/${waveform.id}`,
      originalAuthorizationPath: `/api/media/${submission.data}/${source.id}/original`,
      selection: { start_ms: state.selection.start_ms, end_ms: state.selection.end_ms }
    };
  } catch {
    return unavailable;
  }
}
