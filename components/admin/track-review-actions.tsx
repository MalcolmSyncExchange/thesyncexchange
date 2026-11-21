"use client";

import Link from "next/link";
import { createContext, useActionState, useContext, useState, type ReactNode } from "react";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { Button } from "@/components/ui/button";
import { toggleTrackFeaturedAction, updateTrackStatusWithResultAction, type TrackStatusUpdateResult } from "@/services/admin/actions";

type ReviewFeedback = { result: TrackStatusUpdateResult | { status: "unconfirmed" }; approval: boolean };
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

export function TrackReviewActions({ trackId, status, featured, ownershipTotal }: {
  trackId: string;
  status: string;
  featured?: boolean;
  ownershipTotal?: number;
}) {
  const announceDecision = useContext(QueueDecisionNotice);
  const [feedback, submit, pending] = useActionState(async (_: ReviewFeedback | null, formData: FormData) => {
    announceDecision?.("");
    const next = await submitReview(formData);
    if (next.result.status === "ok") announceDecision?.(feedbackMessage(next));
    return next;
  }, null);
  const ownershipBlocked = ownershipTotal !== undefined && ownershipTotal !== 100;
  const rightsHref = "/admin/rights?track=" + encodeURIComponent(trackId);

  return (
    <div className="min-w-0 space-y-2">
      {status === "pending_review" && ownershipBlocked && (
        <p className="text-sm text-amber-800 dark:text-amber-300">
          Declared ownership shown here is {ownershipTotal}%. Check the rights record before approving.{" "}
          <Link href={rightsHref} className="underline">Review rights</Link>
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {status === "pending_review" && (
          <>
            <form action={submit}>
              <input type="hidden" name="trackId" value={trackId} />
              <input type="hidden" name="status" value="approved" />
              <FormSubmitButton size="sm" variant="outline" pendingLabel="Approving…" disabled={pending}
                data-testid={`approve-track-${trackId}`}>Approve</FormSubmitButton>
            </form>
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
          <FormSubmitButton size="sm" variant="ghost" pendingLabel="Updating…" disabled={pending}>
            {featured ? "Unfeature" : "Feature"}
          </FormSubmitButton>
        </form>
      </div>
      {feedback && !pending && !(announceDecision && feedback.result.status === "ok") && (
        <p role={feedback.result.status === "ok" ? "status" : "alert"} className="break-words text-sm">
          {feedbackMessage(feedback)}
          {feedback.result.status === "rejected" && <> <Link href={rightsHref} className="underline">Review rights</Link></>}
        </p>
      )}
    </div>
  );
}
