import "server-only";

import { cache, Suspense } from "react";

import { TrackReviewActions, type ApprovalReadiness, type TrackReviewActionProps } from "@/components/admin/track-review-actions";
import { mediaRpc } from "@/services/media/uploads";
import { rightsActor } from "@/services/rights/server";

type CheckedProps = Omit<TrackReviewActionProps, "readiness"> & { ownershipTotal: number | null };

const rightsClient = cache(async () => (await rightsActor(true)).client);

async function resolveApproval(trackId: string, ownershipTotal: number | null): Promise<ApprovalReadiness> {
  try {
    const rights = await mediaRpc<{ track_id: string; state: string }>(await rightsClient(), "rights_read", {
      p_track: trackId,
      p_admin: true
    });
    if (rights.track_id !== trackId) return { kind: "unavailable" };

    // rights_read checks current authority on approved cases. With no case, the
    // moderation trigger uses the legacy ownership check and its .01 tolerance.
    switch (rights.state) {
      case "approved":
        return { kind: "ready" };
      case "not_started":
      case "previous_review": {
        if (ownershipTotal === null || !Number.isFinite(ownershipTotal)) return { kind: "unavailable" };
        const hundredths = Math.round(ownershipTotal * 100);
        return Math.abs(hundredths - 10_000) <= 1
          ? { kind: "ready" }
          : { kind: "ownership", total: hundredths / 100 };
      }
      case "draft":
      case "pending":
      case "clarification":
      case "rejected":
      case "disputed":
      case "expired":
      case "revoked":
      case "needs_review":
        return { kind: "rights" };
      default:
        return { kind: "unavailable" };
    }
  } catch {
    return { kind: "unavailable" };
  }
}

async function ResolvedTrackReviewActions({ ownershipTotal, ...props }: CheckedProps) {
  const readiness: ApprovalReadiness = props.status === "pending_review"
    ? await resolveApproval(props.trackId, ownershipTotal)
    : { kind: "unavailable" };
  return <TrackReviewActions {...props} readiness={readiness} />;
}

export function CheckedTrackReviewActions({ ownershipTotal, ...props }: CheckedProps) {
  return (
    <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">Checking approval readiness…</p>}>
      <ResolvedTrackReviewActions {...props} ownershipTotal={ownershipTotal} />
    </Suspense>
  );
}
