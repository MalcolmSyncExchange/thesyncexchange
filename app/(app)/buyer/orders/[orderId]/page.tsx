import { notFound } from "next/navigation";
import { PurchaseDetail } from "@/components/orders/purchase-workspace";
import { requireSession } from "@/services/auth/session";
import { getBuyerPurchase } from "@/services/buyer/purchases";
export const dynamic = "force-dynamic";
export default async function BuyerPurchasePage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  await requireSession("buyer");
  const purchase = await getBuyerPurchase((await params).orderId);
  if (!purchase) notFound();
  return <PurchaseDetail purchase={purchase} />;
}
