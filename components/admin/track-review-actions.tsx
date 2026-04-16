import Link from "next/link";

import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { Button } from "@/components/ui/button";
import { toggleTrackFeaturedAction, updateTrackStatusAction } from "@/services/admin/actions";

export function TrackReviewActions({
  trackId,
  status,
  featured,
  detailHref
}: {
  trackId: string;
  status: string;
  featured?: boolean;
  detailHref?: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {status === "pending_review" ? (
        <>
          <form action={updateTrackStatusAction}>
            <input type="hidden" name="trackId" value={trackId} />
            <input type="hidden" name="status" value="approved" />
            <FormSubmitButton size="sm" pendingLabel="Approving..." data-testid={`approve-track-${trackId}`}>
              Approve
            </FormSubmitButton>
          </form>
          <form action={updateTrackStatusAction}>
            <input type="hidden" name="trackId" value={trackId} />
            <input type="hidden" name="status" value="rejected" />
            <FormSubmitButton size="sm" variant="outline" pendingLabel="Rejecting..." data-testid={`reject-track-${trackId}`}>
              Reject
            </FormSubmitButton>
          </form>
        </>
      ) : null}
      <form action={toggleTrackFeaturedAction}>
        <input type="hidden" name="trackId" value={trackId} />
        <input type="hidden" name="featured" value={String(!featured)} />
        <FormSubmitButton size="sm" variant="ghost" pendingLabel={featured ? "Updating..." : "Featuring..."}>
          {featured ? "Unfeature" : "Feature"}
        </FormSubmitButton>
      </form>
      {detailHref ? (
        <Button asChild size="sm" variant="ghost">
          <Link href={detailHref}>Open Record</Link>
        </Button>
      ) : null}
    </div>
  );
}
