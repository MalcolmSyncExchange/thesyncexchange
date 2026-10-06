"use client";

import { AlertTriangle, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataState } from "@/components/ui/data-state";

export default function ArtistTrackError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="pt-10"><DataState role="alert" icon={AlertTriangle} title="This track could not load" description="No track data was changed. Check your connection, then try loading it again." action={<Button type="button" onClick={reset}><RefreshCcw aria-hidden="true" className="h-4 w-4" />Try again</Button>} /></div>;
}
