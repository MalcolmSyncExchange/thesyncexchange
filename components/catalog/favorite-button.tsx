"use client";

import { Heart } from "lucide-react";
import { useEffect, useOptimistic, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { toggleFavoriteAction } from "@/services/buyer/actions";

export function FavoriteButton({
  trackId,
  initialFavorite,
  revalidatePathname
}: {
  trackId: string;
  initialFavorite: boolean;
  revalidatePathname?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [optimisticFavorite, setOptimisticFavorite] = useOptimistic(initialFavorite, (_current, next: boolean) => next);
  const [feedback, setFeedback] = useState(initialFavorite ? "Saved" : "");

  useEffect(() => {
    if (!feedback || isPending) return;
    const timeout = setTimeout(() => setFeedback(""), 1800);
    return () => clearTimeout(timeout);
  }, [feedback, isPending]);

  return (
    <form
      action={(formData) => {
        const nextValue = !optimisticFavorite;
        setOptimisticFavorite(nextValue);
        setFeedback(nextValue ? "Saving to favorites..." : "Removing from favorites...");
        startTransition(async () => {
          formData.set("nextValue", String(nextValue));
          await toggleFavoriteAction(formData);
          setFeedback(nextValue ? "Saved" : "Removed");
        });
      }}
      className="flex flex-col items-end gap-1"
    >
      <input type="hidden" name="trackId" value={trackId} />
      {revalidatePathname ? <input type="hidden" name="revalidatePathname" value={revalidatePathname} /> : null}
      <Button variant={optimisticFavorite ? "secondary" : "ghost"} size="sm" disabled={isPending} aria-pressed={optimisticFavorite}>
        <Heart className={`h-4 w-4 ${optimisticFavorite ? "fill-current" : ""}`} />
      </Button>
      <span className="min-h-[1rem] text-[11px] text-muted-foreground" aria-live="polite">
        {feedback}
      </span>
    </form>
  );
}
