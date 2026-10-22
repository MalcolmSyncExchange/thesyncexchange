"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function AssetDownloadButton({ orderId, assetId, label, available }: { orderId: string; assetId: string; label: string; available: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function download() {
    if (busy) return;
    setBusy(true); setMessage("Preparing secure download…");
    try {
      let response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/assets/${encodeURIComponent(assetId)}/download`, {
        method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Idempotency-Key": crypto.randomUUID() }
      });
      if (!response.ok) throw new Error("Download unavailable. Refresh this purchase or contact support.");
      if (response.headers.get("content-type")?.includes("application/json")) {
        const descriptor = await response.json() as { brokerUrl: string; ticket: string };
        if (new URL(descriptor.brokerUrl).protocol !== "https:" || !/^[a-f0-9]{64}$/.test(descriptor.ticket)) throw new Error("Invalid download authorization.");
        response = await fetch(descriptor.brokerUrl, { method: "POST", credentials: "omit", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket: descriptor.ticket }) });
        if (!response.ok) throw new Error("Download unavailable.");
      }
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = response.headers.get("content-disposition")?.match(/filename="([a-zA-Z0-9._-]+)"/)?.[1] || "tse-licensed-asset";
      link.click();
      setTimeout(() => URL.revokeObjectURL(href), 30_000);
      setMessage("Download prepared. Check your browser’s downloads.");
    } catch { setMessage("Download unavailable. Refresh this purchase or contact support."); }
    finally { setBusy(false); }
  }
  return <div><Button variant="outline" disabled={!available || busy} onClick={download} aria-label={`Download ${label}`} aria-busy={busy}>{busy ? "Preparing…" : available ? "Download" : "Unavailable"}</Button><p role="status" aria-live="polite" className="mt-1 text-sm">{message}</p></div>;
}
