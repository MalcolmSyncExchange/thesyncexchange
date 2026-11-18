import { env } from "@/lib/env";
export class PaymentError extends Error { constructor(public status: number, public code: string) { super(code); } }
export const paymentHeaders = { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer" };
export async function readPaymentRequest(request: Request) {
  if (request.headers.get("origin") !== new URL(env.appUrl).origin) throw new PaymentError(403, "ORIGIN_DENIED");
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new PaymentError(415, "JSON_REQUIRED");
  const reader = request.body?.getReader(); if (!reader) throw new PaymentError(400, "INVALID_REQUEST");
  let timeout: ReturnType<typeof setTimeout> | undefined; let size = 0; const chunks: Uint8Array[] = [];
  const deadline = new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new PaymentError(408, "REQUEST_TIMEOUT")), 5000); });
  try { for (;;) { const r = await Promise.race([reader.read(), deadline]); if (r.done) break; size += r.value.byteLength; if (size > 8192) throw new PaymentError(413, "REQUEST_TOO_LARGE"); chunks.push(r.value); }
    try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))) as unknown; }
    catch { throw new PaymentError(400, "INVALID_REQUEST"); }
  } finally { clearTimeout(timeout); void reader.cancel().catch(() => {}); reader.releaseLock(); }
}
