"use client";

import Link from "next/link";
import { createContext, useActionState, useContext, useId, useState, type ReactNode } from "react";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toggleTrackFeaturedAction, updateTrackStatusWithResultAction, type TrackStatusUpdateResult } from "@/services/admin/actions";

type ReviewFeedback = { result: TrackStatusUpdateResult | { status: "unconfirmed" }; approval: boolean };
export type ApprovalReadiness = { kind: "ready" | "rights" | "unavailable" } | { kind: "ownership"; total: number };
export type TrackReviewActionProps = {
  trackId: string;
  status: string;
  featured?: boolean;
  readiness: ApprovalReadiness;
  className?: string;
};
const QueueDecisionNotice = createContext<((message: string) => void) | null>(null);

export function TrackQueueDecisionFeedback({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");

  return (
    <QueueDecisionNotice.Provider value={setMessage}>
      <p role="status" className={message ? "text-sm font-medium" : "sr-only"}>{message}</p>
      {children}
    </QueueDecisionNotice.Provider>
  );
}

async function submitReview(formData: FormData): Promise<ReviewFeedback> {
  const approval = formData.get("status") === "approved";
  try {
    return { result: await updateTrackStatusWithResultAction(formData), approval };
  } catch {
    // Session or transport errors can prevent a result. Never imply that the decision committed.
    return { result: { status: "unconfirmed" }, approval };
  }
}

function feedbackMessage({ result, approval }: ReviewFeedback) {
  switch (result.status) {
    case "ok": return approval ? "Track approved." : "Track rejected.";
    case "rejected": return result.code === "OWNERSHIP_TOTAL_INVALID"
      ? "Declared ownership must equal 100% before this track can be approved."
      : "A current rights review is required before approval.";
    case "unavailable": return "The decision could not be confirmed. Check the record and try again.";
    case "invalid_request": return "This decision request is invalid. Refresh the record before trying again.";
    case "not_updated": return "The track was not updated. Refresh the record and check whether it is still available.";
    case "unconfirmed": return "The decision could not be confirmed. Check your Admin session and account security before trying again.";
  }
}

export function TrackReviewActions({ trackId, status, featured, readiness, className }: TrackReviewActionProps) {
  const descriptionId = useId();
  const announceDecision = useContext(QueueDecisionNotice);
  const [feedback, submit, pending] = useActionState(async (_: ReviewFeedback | null, formData: FormData) => {
    announceDecision?.("");
    const next = await submitReview(formData);
    if (next.result.status === "ok") announceDecision?.(feedbackMessage(next));
    return next;
  }, null);
  const approvalRejected = feedback?.approval && feedback.result.status === "rejected";
  const canApprove = readiness.kind === "ready" && !approvalRejected;
  const readinessText = readiness.kind === "ownership" ? `Approval blocked · ${readiness.total}% ownership declared`
    : readiness.kind === "rights" ? "Approval blocked · Current rights review required"
    : readiness.kind === "unavailable" ? "Approval readiness unavailable" : null;
  const rightsHref = "/admin/rights?track=" + encodeURIComponent(trackId);
  const rightsLink = "rounded-sm underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className={cn("min-w-0 space-y-2", className)}>
      {status === "pending_review" && readinessText && !approvalRejected && (
        <div id={descriptionId} className="flex flex-wrap items-baseline gap-x-2 text-sm text-amber-800 dark:text-amber-300">
          <p role="status">{readinessText}</p>
          {(readiness.kind === "ownership" || readiness.kind === "rights") && <Link href={rightsHref} className={rightsLink}>Review rights</Link>}
          {readiness.kind === "unavailable" && <button type="button" className={rightsLink} onClick={() => window.location.reload()}>Recheck approval</button>}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {status === "pending_review" && (
          <>
            {canApprove ? <form action={submit}>
              <input type="hidden" name="trackId" value={trackId} />
              <input type="hidden" name="status" value="approved" />
              <FormSubmitButton size="sm" variant="outline" pendingLabel="Approving…" disabled={pending}
                data-testid={`approve-track-${trackId}`}>Approve</FormSubmitButton>
            </form> : <Button type="button" size="sm" variant="outline" disabled aria-describedby={descriptionId}
              data-testid={`approve-track-${trackId}`}>Approve</Button>}
            <form action={submit}>
              <input type="hidden" name="trackId" value={trackId} />
              <input type="hidden" name="status" value="rejected" />
              <FormSubmitButton size="sm" variant="outline" pendingLabel="Rejecting…" disabled={pending}
                data-testid={`reject-track-${trackId}`}>Reject</FormSubmitButton>
            </form>
          </>
        )}
        <form action={toggleTrackFeaturedAction}>
          <input type="hidden" name="trackId" value={trackId} />
          <input type="hidden" name="featured" value={String(!featured)} />
          <FormSubmitButton size="sm" variant="ghost" pendingLabel="Updating…" disabled={pending}
            title={status === "pending_review" && !featured ? "Buyer placement requires publication and eligibility" : undefined}>
            {featured ? "Unfeature" : "Feature"}
          </FormSubmitButton>
        </form>
      </div>
      {feedback && !pending && !(announceDecision && feedback.result.status === "ok") && (
        <p id={approvalRejected ? descriptionId : undefined} role={feedback.result.status === "ok" ? "status" : "alert"} className="break-words text-sm">
          {feedbackMessage(feedback)}
          {feedback.result.status === "rejected" && <> <Link href={rightsHref} className={rightsLink}>Review rights</Link></>}
          {approvalRejected && <> <button type="button" className={rightsLink} onClick={() => window.location.reload()}>Recheck approval</button></>}
        </p>
      )}
    </div>
  );
}
