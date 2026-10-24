"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
const messages: Record<number, string> = { 401: "Sign in again to download this file.", 403: "This account cannot download this file.", 404: "This download is unavailable for this purchase.", 409: "Access changed or this authorization expired. Refresh delivery and request a new download.", 429: "Too many download requests. Wait a minute before trying again.", 503: "File preparation is temporarily unavailable. Try again from this purchase." };
export function AssetDownloadButton({ orderId, assetId, label, available }: { orderId: string; assetId: string; label: string; available: boolean }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [progress, setProgress] = useState<number | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function download() {
    if (controller.current) return;
    const abort = new AbortController();controller.current = abort;
    setBusy(true);setProgress(null);setMessage("Preparing and verifying secure download…");
    try {
      let response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/assets/${encodeURIComponent(assetId)}/download`, {
        method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error", signal: abort.signal, headers: { "Idempotency-Key": crypto.randomUUID() }
      });
      if (!response.ok) throw Error(messages[response.status] || "Download unavailable. Refresh delivery or contact support.");
      if (response.headers.get("content-type")?.includes("application/json")) {
        const descriptor = await response.json() as { brokerUrl: string; ticket: string };
        const url = new URL(descriptor.brokerUrl);
        if (url.protocol !== "https:" || url.pathname !== "/download" || url.search || url.hash || url.username || url.password || !/^[a-f0-9]{64}$/.test(descriptor.ticket)) throw Error("Download authorization is unavailable.");
        response = await fetch(descriptor.brokerUrl, { method: "POST", credentials: "omit", cache: "no-store", redirect: "error", signal: abort.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket: descriptor.ticket }) });
        if (!response.ok) throw Error(messages[response.status] || "Download unavailable. Request a new download from this purchase.");
      }
      const length = Number(response.headers.get("content-length"));
      if (!response.body || !Number.isSafeInteger(length) || length < 1 || length > 250_000_000 || !/^(audio\/(wav|x-wav|mpeg|aiff|flac)|application\/(zip|pdf))$/.test(response.headers.get("content-type") || "")) throw Error("File integrity could not be verified. Contact support.");
      const reader = response.body.getReader(), chunks: Uint8Array<ArrayBuffer>[] = [];let received = 0;
      try { for (;;) { const part = await reader.read();if (part.done) break;received += part.value.byteLength;if (received > length) throw Error("File integrity could not be verified. Contact support.");chunks.push(part.value);setProgress(Math.floor(received / length * 100));setMessage("Receiving verified file…"); } }
      finally { void reader.cancel().catch(() => {});reader.releaseLock(); }
      if (received !== length || abort.signal.aborted) throw Error("Transfer interrupted. Request a fresh download from this purchase.");
      const blob = new Blob(chunks, { type: response.headers.get("content-type")! }), href = URL.createObjectURL(blob), link = document.createElement("a");
      link.href = href;link.download = response.headers.get("content-disposition")?.match(/filename="([a-zA-Z0-9._-]+)"/)?.[1] || "tse-licensed-asset";
      document.body.appendChild(link);link.click();link.remove();setTimeout(() => URL.revokeObjectURL(href), 30_000);
      setMessage("File prepared for saving. Check your browser’s downloads.");
    } catch (e) { setMessage(abort.signal.aborted ? "Download canceled. You can request a fresh download." : (e as Error).message.includes("download") || (e as Error).message.includes("File integrity") || (e as Error).message.includes("Transfer interrupted") ? (e as Error).message : "Transfer interrupted. Try a fresh download from this purchase."); }
    finally { controller.current = null;setBusy(false);window.dispatchEvent(new CustomEvent("tse-delivery-updated", { detail: orderId })); }
  }
  return <div className="max-w-full space-y-1"><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={!available || busy} onClick={download} aria-label={`Download ${label}`} aria-busy={busy}>{busy ? "Downloading…" : available ? "Download" : "Unavailable"}</Button>{busy ? <Button variant="outline" onClick={() => controller.current?.abort()} aria-label={`Cancel download ${label}`}>Cancel</Button> : null}</div>
    {busy && progress !== null ? <progress className="w-full" value={progress} max={100} aria-label={`Download progress ${label}`}>{progress}%</progress> : null}<p role="status" aria-live="polite" className="mt-1 max-w-sm text-sm">{message}</p></div>;
}
