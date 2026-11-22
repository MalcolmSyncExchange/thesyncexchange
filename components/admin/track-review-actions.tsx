"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { createContext, useActionState, useContext, useId, useState, type ReactNode } from "react";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import queueStyles from "./review-queue-table.module.css";
import { toggleTrackFeaturedAction, updateTrackStatusWithResultAction, type TrackStatusUpdateResult } from "@/services/admin/actions";

type ReviewFeedback = { result: TrackStatusUpdateResult | { status: "unconfirmed" }; approval: boolean };
export type ApprovalReadiness = { kind: "ready" | "rights" | "unavailable" } | { kind: "ownership"; total: number };
export type TrackReviewActionProps = {
  trackId: string;
  status: string;
  featured?: boolean;
  readiness: ApprovalReadiness;
  className?: string;
  layout?: "queue";
  declaredOwnership?: number;
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

export function TrackQueueReviewBand({ actions, children }: { actions: ReactNode; children: ReactNode }) {
  const evidenceId = useId();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={cn(queueStyles.band, "group/review grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 border-t border-border pt-1 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:gap-x-3 sm:pt-2")}>
      {actions}
      <Button type="button" variant="ghost" size="sm"
        className={cn(queueStyles.evidenceButton, "col-start-2 row-start-2 min-h-11 self-end gap-1 px-1.5 sm:col-start-3 sm:row-start-1 sm:min-h-9 sm:self-center sm:px-2 group-has-[[data-review-feedback]]/review:row-start-4 sm:group-has-[[data-review-feedback]]/review:row-start-3")}
        aria-label="Review evidence" aria-controls={evidenceId} aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
        <ChevronDown className={cn("size-3.5 shrink-0", expanded && "rotate-180")} aria-hidden="true" />
        <span className={cn(queueStyles.evidenceLong, "hidden sm:inline")}>Review evidence</span>
        <span className={cn(queueStyles.evidenceShort, "sm:hidden")}>Evidence</span>
      </Button>
      <div id={evidenceId} hidden={!expanded} className={cn(queueStyles.evidencePanel, "col-span-full row-start-4 mt-2 min-w-0 border-t border-border pt-2 sm:row-start-3 group-has-[[data-review-feedback]]/review:row-start-5 sm:group-has-[[data-review-feedback]]/review:row-start-4")}>
        {children}
      </div>
    </div>
  );
}

export function TrackReviewActions({ trackId, status, featured, readiness, className, layout, declaredOwnership }: TrackReviewActionProps) {
  const queueLayout = layout === "queue";
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
    : readiness.kind === "unavailable" ? "Approval readiness unavailable"
    : queueLayout ? "Ready for approval" : null;
  const rightsHref = "/admin/rights?track=" + encodeURIComponent(trackId);
  const rightsLink = cn("rounded-sm underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    queueLayout && "inline-flex min-h-11 items-center sm:min-h-6");

  return (
    <div className={cn(queueLayout ? "contents" : "min-w-0 space-y-2", className)}>
      {status === "pending_review" && readinessText && !approvalRejected && (
        <div id={descriptionId} className={cn("flex flex-wrap items-baseline gap-x-2 text-sm",
          readiness.kind === "ready" ? "text-muted-foreground" : "text-amber-800 dark:text-amber-300",
          queueLayout && queueStyles.readiness,
          queueLayout && "col-span-full row-start-1 min-w-0 items-center sm:col-span-1")}>
          {queueLayout && readiness.kind !== "ownership" && declaredOwnership !== undefined && (
            <span className={cn(queueStyles.ownership, "text-muted-foreground")}>{declaredOwnership}% ownership declared</span>
          )}
          <p role="status" className={queueLayout ? "min-w-0 [overflow-wrap:anywhere]" : undefined}>{readinessText}</p>
          {(readiness.kind === "ownership" || readiness.kind === "rights" || queueLayout) && <Link href={rightsHref} className={rightsLink}>Review rights</Link>}
          {readiness.kind === "unavailable" && <button type="button" className={rightsLink} onClick={() => window.location.reload()}>Recheck approval</button>}
        </div>
      )}
      <div className={cn("flex flex-wrap gap-2", queueLayout && queueStyles.moderation, queueLayout
        && "col-start-1 row-start-2 mt-1.5 gap-1.5 sm:col-start-2 sm:row-start-1 sm:mt-0 [&_button]:min-h-11 [&_button]:px-2.5 sm:[&_button]:min-h-9 sm:[&_button]:px-3")}>
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
        <p id={approvalRejected ? descriptionId : undefined} data-review-feedback={queueLayout ? "" : undefined} role={feedback.result.status === "ok" ? "status" : "alert"} className={cn("break-words text-sm", queueLayout && queueStyles.feedback, queueLayout && "col-span-full row-start-3 mt-2 sm:row-start-2")}>
          {approvalRejected && queueLayout && declaredOwnership !== undefined && (
            <span className={cn(queueStyles.ownership, "mr-2 text-muted-foreground")}>{declaredOwnership}% ownership declared</span>
          )}
          {feedbackMessage(feedback)}
          {feedback.result.status === "rejected" && <> <Link href={rightsHref} className={rightsLink}>Review rights</Link></>}
          {approvalRejected && <> <button type="button" className={rightsLink} onClick={() => window.location.reload()}>Recheck approval</button></>}
        </p>
      )}
    </div>
  );
}
