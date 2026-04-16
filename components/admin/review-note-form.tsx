import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { addReviewNoteAction } from "@/services/admin/actions";

export function ReviewNoteForm({ trackId }: { trackId: string }) {
  return (
    <form action={addReviewNoteAction} className="space-y-3">
      <input type="hidden" name="trackId" value={trackId} />
      <Textarea name="note" placeholder="Add a reviewer note for this submission." className="min-h-[100px]" required />
      <Button type="submit" size="sm">
        Add Note
      </Button>
    </form>
  );
}
