"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function RetryTrackSubmissions() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" variant="outline" size="lg" aria-disabled={pending} onClick={() => {
        if (!pending) startTransition(() => router.refresh());
      }}>
        Try Again
      </Button>
      <span role="status" className="text-sm text-muted-foreground">{pending ? "Trying again…" : ""}</span>
    </div>
  );
}
