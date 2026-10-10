"use client";
import { useState, type ReactNode } from "react";
import { useAnalytics } from "./provider";
import { filterProperties } from "@/lib/analytics/schema";
export function LicenseForm({ action, trackId, children }: { action: (data: FormData) => Promise<void>; trackId: string; children: ReactNode }) {
  const [method, setMethod] = useState("default_accepted");
  const capture = useAnalytics();
  return <form action={action} className="space-y-4" data-testid="buyer-checkout-form" onChange={event => {
    const input = event.target;
    if (input instanceof HTMLInputElement && input.name === "licenseSelection") {
      setMethod("explicit");
      const safe = filterProperties("license_selected", { track_id: trackId, license_type: input.dataset.licenseType, selection_method: "explicit" });
      if (safe) capture("license_selected", safe);
    }
  }}><input type="hidden" name="analyticsSelectionMethod" value={method} />{children}</form>;
}
