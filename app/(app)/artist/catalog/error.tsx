"use client";

import { AlertTriangle, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataState } from "@/components/ui/data-state";

export default function ArtistCatalogError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="pt-10"><DataState role="alert" icon={AlertTriangle} title="Your catalog could not load" description="Your tracks are safe. Check your connection, then try loading the catalog again." action={<Button type="button" onClick={reset}><RefreshCcw aria-hidden="true" className="h-4 w-4" />Try again</Button>} /></div>;
}
