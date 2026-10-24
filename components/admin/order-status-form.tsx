import Link from "next/link";
export function OrderStatusForm({ orderId }: { orderId: string; status: string }) {
  return <Link href={"/admin/payments?order=" + encodeURIComponent(orderId)} className="text-sm underline">Review payment evidence and recovery</Link>;
}
