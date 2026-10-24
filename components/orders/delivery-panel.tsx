"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { BuyerAsset } from "@/services/delivery/server";
type Attempt = { id: string; entitlement_id: string; decision: string; reason: string; authorized_at: string; expires_at: string; preparation_state: string | null; transfer: string | null; bytes_observed: number | null };
type Operation = { id: string; command: string; reason: string; reference: string; created_at: string };
type Delivery = { orderId: string; assets: BuyerAsset[]; restricted: boolean; history: Attempt[]; operations: Operation[]; payment: { paymentState: string; paymentHold: boolean; issuanceState: string; contractualState: string } };
const time = (s: string) => Number.isFinite(Date.parse(s)) ? new Date(s).toLocaleString() : "Time unavailable";
async function request(input: object) {
  const r = await fetch("/api/delivery", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  if (!r.ok) throw Error("Delivery records are unavailable. Try again or contact support with your order reference.");
  return r.json();
}
function History({ items }: { items: Attempt[] }) {
  return <section className="space-y-3" aria-label="Download history"><h3 className="font-medium">Download history</h3>
    <p className="text-sm text-muted-foreground">The latest 100 attempts are shown. Preparation and server transfer records do not confirm receipt on your device.</p>
    {!items.length ? <p>No download attempts recorded.</p> : <ol className="space-y-3">{items.map(item => <li key={item.id} className="break-words rounded-md border p-3 text-sm">
      <p>{time(item.authorized_at)} · {item.decision === "allowed" ? "Authorized" : "Access denied"}</p>
      <p>Preparation: {item.preparation_state || (item.decision === "allowed" ? "In progress" : "Not started")} · Transfer: {item.transfer || "Not observed"}</p>
      {item.bytes_observed !== null ? <p>Server stream bytes: {item.bytes_observed.toLocaleString()}</p> : null}
      <p className="text-xs text-muted-foreground">Attempt {item.id}</p>
    </li>)}</ol>}
  </section>;
}
export function DeliveryPanel({ orderId, admin = false }: { orderId: string; admin?: boolean }) {
  const router = useRouter();
  const [data, setData] = useState<Delivery | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [command, setCommand] = useState("record_review"), [reason, setReason] = useState(""), [reference, setReference] = useState("");
  const operation = useRef<{ payload: string; key: string } | null>(null);
  const load = useCallback(async () => { setBusy(true); setError(""); try { setData(await request({ action: "read", order: orderId })); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }, [orderId]);
  useEffect(() => { void load(); const updated = (e: Event) => { if ((e as CustomEvent).detail === orderId) void load(); }; window.addEventListener("tse-delivery-updated", updated); return () => window.removeEventListener("tse-delivery-updated", updated); }, [load, orderId]);
  async function operate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();setBusy(true);setMessage("");
    const payload = JSON.stringify({ orderId, command, reason, reference });
    if (operation.current?.payload !== payload) operation.current = { payload, key: crypto.randomUUID() };
    try { await request({ action: "operate", order: orderId, key: operation.current.key, command, reason, reference }); setMessage("Audited operation recorded. No access restrictions were removed."); await load(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <section className="space-y-4 rounded-lg border p-4" aria-label={admin ? "Delivery investigation" : "Delivery history and recovery"} aria-busy={busy}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">{admin ? "Delivery investigation" : "Download activity"}</h2><Button variant="outline" onClick={() => { router.refresh(); void load(); }} disabled={busy}>{busy ? "Loading delivery…" : "Refresh delivery"}</Button></div>
    {error ? <p role="alert">{error}</p> : null}
    {data ? <>
      {data.restricted ? <p role="status">File access is restricted. Contact support with your order reference.</p> : null}
      {admin ? <><p className="break-all text-sm">Order {data.orderId}</p><p>Payment: {data.payment.paymentState} · {data.payment.paymentHold ? "Hold active" : "No payment hold"} · License: {data.payment.contractualState}</p>
        <ul className="space-y-2">{data.assets.map(a => <li className="break-words" key={a.id}>{a.label} · {a.kind} · {a.state} · {a.available ? "Available" : "Unavailable"}<p className="text-xs">Entitlement {a.id} · {a.availabilityReason}</p></li>)}</ul></> : null}
      <History items={data.history}/>
      {admin ? <>
        <form className="space-y-3" onSubmit={operate}>
          <label className="block">Delivery operation<select aria-label="Delivery operation" className="mt-1 block w-full rounded border bg-background p-2" value={command} onChange={e => setCommand(e.target.value)}><option value="record_review">Record investigation</option><option value="close_expired_attempts">Close expired attempts</option><option value="restrict_access">Restrict file access</option></select></label>
          <label className="block">Investigation reason<textarea aria-label="Investigation reason" className="mt-1 block w-full rounded border bg-background p-2" required minLength={5} maxLength={2000} value={reason} onChange={e => setReason(e.target.value)}/></label>
          <label className="block">Evidence reference<input aria-label="Evidence reference" className="mt-1 block w-full rounded border bg-background p-2" required minLength={5} maxLength={500} value={reference} onChange={e => setReference(e.target.value)}/></label>
          <p className="text-sm">Closing expired attempts releases stale preparation records. Buyers request a fresh download from the original purchase. Recovery rechecks the original entitlement; holds, rights and asset versions stay enforced.</p>
          <Button disabled={busy || reason.trim().length < 5 || reference.trim().length < 5}>Record delivery operation</Button>
        </form>
        <p role="status">{message}</p>
        <a className="underline" href={`/admin/payments?order=${encodeURIComponent(orderId)}`}>Payment and fulfillment investigation</a>
        <details><summary>Delivery operation history</summary><ul className="space-y-3">{data.operations.map(o => <li className="break-words text-sm" key={o.id}>{time(o.created_at)} · {o.command}<p>{o.reason}</p><p>{o.reference}</p></li>)}</ul></details>
      </> : null}
    </> : !error ? <p role="status">Loading download activity…</p> : null}
  </section>;
}
export function DeliveryOperations({ initialOrder = "" }: { initialOrder?: string }) {
  const [orders, setOrders] = useState<Delivery[]>([]), [page, setPage] = useState(1), [selected, setSelected] = useState(initialOrder), [error, setError] = useState("");
  useEffect(() => { let live = true; request({ action: "list", page, size: 10 }).then(v => { if (live) { setOrders(v); setError(""); } }).catch(e => { if (live) setError(e.message); }); return () => { live = false; }; }, [page]);
  return <main className="space-y-5"><h1 className="text-3xl font-semibold">Secure delivery operations</h1><p>Investigate entitlement, preparation and transfer evidence. Historical agreements remain available according to the retained license record.</p>
    {error ? <p role="alert">{error}</p> : null}
    <ul className="space-y-2">{orders.map(o => <li key={o.orderId}><Button className="h-auto max-w-full whitespace-normal break-all text-left" variant="outline" onClick={() => setSelected(o.orderId)}>Inspect delivery {o.orderId}</Button></li>)}</ul>
    <div className="flex flex-wrap items-center gap-3"><Button disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous deliveries</Button><p>Page {page}</p><Button disabled={orders.length < 10 || page >= 10000} onClick={() => setPage(p => p + 1)}>Next deliveries</Button></div>
    {selected ? <DeliveryPanel key={selected} orderId={selected} admin/> : null}
  </main>;
}
