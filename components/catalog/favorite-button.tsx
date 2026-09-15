"use client";

import { Heart } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toggleFavoriteAction } from "@/services/buyer/actions";

export function FavoriteButton({ trackId, trackTitle = "track", initialFavorite, revalidatePathname }: {
  trackId: string; trackTitle?: string; initialFavorite: boolean; revalidatePathname?: string;
}) {
  const [favorite, setFavorite] = useState(initialFavorite);
  const [feedback, setFeedback] = useState("");
  const [pending, startTransition] = useTransition();
  useEffect(() => setFavorite(initialFavorite), [initialFavorite]);
  function toggle() {
    const previous = favorite;
    const next = !previous;
    setFavorite(next);
    setFeedback(next ? "Saving…" : "Removing…");
    startTransition(async () => {
      const data = new FormData();
      data.set("trackId", trackId);
      data.set("nextValue", String(next));
      if (revalidatePathname) data.set("revalidatePathname", revalidatePathname);
      try {
        const result = await toggleFavoriteAction(data);
        if (result?.error) throw new Error(result.error);
        setFeedback(next ? "Saved" : "Removed");
      } catch {
        setFavorite(previous);
        setFeedback("Couldn’t save. Try again.");
      }
    });
  }
  return <div className="flex flex-col items-end gap-1">
    <Button type="button" variant={favorite ? "secondary" : "ghost"} className="h-11 w-11 p-0" disabled={pending} aria-label={`${favorite ? "Remove" : "Save"} ${trackTitle} ${favorite ? "from" : "to"} favorites`} aria-pressed={favorite} onClick={toggle}>
      <Heart aria-hidden="true" className={`h-4 w-4 ${favorite ? "fill-current" : ""}`} />
    </Button>
    <span className="max-w-36 text-xs text-muted-foreground" role="status">{feedback}</span>
  </div>;
}
